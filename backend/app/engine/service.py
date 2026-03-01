from mlx_lm import load, generate
from mlx_lm.tuner import train, TrainingArgs
from mlx_lm.utils import load_adapters
import mlx.core as mx
import gc
import asyncio
import threading
import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class MLXEngineService:
    def __init__(self):
        self.active_jobs = {}
        self.active_downloads = set()
        self.active_model_id = None
        self.active_model = None
        self.active_tokenizer = None
        self.loaded_models = {}
        self.stop_event = threading.Event()
        self.generation_lock = asyncio.Lock()

        # Use writable per-user directory for models/adapters
        self.workspace_dir = Path.home() / ".silicon-studio"
        self.models_dir = self.workspace_dir / "models"
        self.adapters_dir = self.workspace_dir / "adapters"
        
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.adapters_dir.mkdir(parents=True, exist_ok=True)
        
        # New for Phase 9: Auto-discover local models
        self.discovery_paths = [
            Path("~/.lmstudio/models").expanduser(),
            Path("~/.ollama/models").expanduser(),
            Path("~/.cache/huggingface/hub").expanduser()
        ]
        
        # Use writable per-user location for models registry
        user_data_dir = Path.home() / ".silicon-studio"
        user_data_dir.mkdir(parents=True, exist_ok=True)
        self.models_config_path = user_data_dir / "models.json"
        logger.info(f"Models config at: {self.models_config_path}")
                
        self.models_config = self._load_models_config()
        self._run_auto_discovery()

    def _run_auto_discovery(self):
        """Scan known local model directories (LM Studio, Ollama, HuggingFace cache)."""
        logger.info("Running local model auto-discovery...")
        discovered_count = 0
        for path in self.discovery_paths:
            if path.exists():
                logger.info(f"Scanning discovery path: {path}")
                try:
                    models = self.register_model(name=f"Local / {path.name.replace('-',' ').title()}", path=str(path))
                    discovered_count += len(models)
                except Exception as e:
                    logger.debug(f"Discovery skip for {path}: {e}")
        logger.info(f"Auto-discovery complete. Found {discovered_count} new local models.")

    def _load_models_config(self):
        # Load directly from models.json as the source of truth
        if self.models_config_path.exists():
            try:
                with open(self.models_config_path, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading models.json: {e}")
                return []
        else:
            return []

    def _save_models_config(self):
        with open(self.models_config_path, "w") as f:
            json.dump(self.models_config, f, indent=4)
            
    def _get_dir_size_str(self, path: Path):
        try:
            total_size = 0
            for dirpath, dirnames, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    # skip if it is symbolic link
                    if not os.path.islink(fp):
                        total_size += os.path.getsize(fp)
            
            gb = total_size / (1024 * 1024 * 1024)
            if gb < 1:
                return f"{gb:.2f}GB"
            return f"{gb:.1f}GB"
        except Exception as e:
            logger.warning(f"Error calculating size for {path}: {e}")
            return "Unknown"

    def _get_model_metadata(self, model_path: Path) -> Dict[str, Any]:
        """
        Extracts metadata from model files.
        Supports: config.json (Transformers), .gguf (Llama.cpp), .safetensors (HF)
        """
        meta = {
            "architecture": "Unknown",
            "context_window": "Unknown",
            "quantization": "Standard"
        }
        
        # 1. Transformers config.json
        config_path = model_path / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r") as f:
                    config = json.load(f)
                    if "model_type" in config:
                        meta["architecture"] = config["model_type"].capitalize()
                    for key in ["max_position_embeddings", "model_max_length", "n_ctx", "max_sequence_length"]:
                        if key in config:
                            val = config[key]
                            meta["context_window"] = f"{val // 1024}k" if val > 1000 else str(val)
                            break
                    if "quantization" in config:
                        q = config["quantization"]
                        meta["quantization"] = f"{q['bits']}-bit" if isinstance(q, dict) and "bits" in q else str(q)
            except Exception as e:
                logger.debug(f"Failed to parse config.json for {model_path}: {e}")

        # 2. GGUF Parsing (Quick Scanner)
        gguf_files = list(model_path.glob("*.gguf"))
        if gguf_files:
            try:
                # GGUF has a specific binary header. We just peek for the 'GGUF' magic and common keys
                with open(gguf_files[0], "rb") as f:
                    chunk = f.read(1024).decode('utf-8', 'ignore')
                    if "GGUF" in chunk:
                        meta["architecture"] = "GGUF"
                        if "q4_k_m" in chunk.lower(): meta["quantization"] = "Q4_K_M"
                        elif "q8_0" in chunk.lower(): meta["quantization"] = "Q8_0"
            except Exception as e:
                logger.debug(f"Failed to parse GGUF header for {gguf_files[0]}: {e}")

        # 3. Refine by folder/file names
        name_lower = model_path.name.lower()
        if meta["quantization"] == "Standard":
            if "4bit" in name_lower or "q4" in name_lower: meta["quantization"] = "4-bit"
            elif "8bit" in name_lower or "q8" in name_lower: meta["quantization"] = "8-bit"
            elif "fp16" in name_lower: meta["quantization"] = "FP16"

        return meta

    def scan_directory(self, path: str, max_depth=4) -> List[Dict[str, Any]]:
        """
        Scans a directory for MLX models and returns a list of found models with metadata.
        Does NOT register them.
        """
        target_path = Path(path).expanduser().resolve()
        if not target_path.exists():
            return []
            
        found_models = []
        
        def _scan(dir_path: Path, depth: int):
            if depth > max_depth:
                return
            
            # Check if this folder is a model
            if (dir_path / "config.json").exists():
                meta = self._get_model_metadata(dir_path)
                found_models.append({
                    "id": str(dir_path),
                    "name": dir_path.name,
                    "path": str(dir_path),
                    "size": self._get_dir_size_str(dir_path),
                    "architecture": meta.get("architecture"),
                    "context_window": meta.get("context_window"),
                    "quantization": meta.get("quantization")
                })
                # Don't recurse into model folders
                return
            
            # Check for GGUF folder (informational)
            if any(dir_path.glob("*.gguf")):
                # We could add GGUF detection here if we want to show them in UI
                pass

            try:
                for child in sorted(list(dir_path.iterdir())):
                    if child.is_dir() and not child.name.startswith('.'):
                        if child.name.lower() in ["node_modules", "venv", ".git", "__pycache__", "site-packages"]:
                            continue
                        _scan(child, depth + 1)
            except PermissionError:
                logger.debug(f"Permission denied scanning: {dir_path}")

        _scan(target_path, 0)
        return found_models

    def register_model(self, name: str, path: str, url: str = ""):
        """
        Registers a custom model from a local path.
        If path is a directory of models, it registers all found models.
        """
        target_path = Path(path).expanduser().resolve()
        if not target_path.exists():
            raise ValueError(f"Directory {path} does not exist.")
            
        # If the path itself is a model, register just it
        if (target_path / "config.json").exists():
            return [self._register_single_path(target_path, name, url)]
            
        # Otherwise scan and register all
        found = self.scan_directory(str(target_path))
        if not found:
             raise ValueError(f"No valid MLX models found in {path}. Make sure the folders contain 'config.json'.")
             
        added = []
        for m in found:
            added.append(self._register_single_path(Path(m["path"]), name, url))
        
        self._save_models_config()
        return added

    def _register_single_path(self, model_path: Path, group_name: str, url: str):
        # Check if already registered
        for m in self.models_config:
             if m['id'] == str(model_path):
                 return m
        
        model_name = model_path.name
        size_str = self._get_dir_size_str(model_path)
        meta = self._get_model_metadata(model_path)
        
        new_model = {
            "id": str(model_path),
            "name": f"{group_name} / {model_name}" if group_name and group_name.lower() not in ["", "ollama models", "lm studio models"] else model_name,
            "size": size_str,
            "family": meta.get("architecture", "Custom"),
            "architecture": meta.get("architecture", "Unknown"),
            "context_window": meta.get("context_window", "Unknown"),
            "quantization": meta.get("quantization", "Standard"),
            "url": url,
            "external": False, 
            "is_custom": True
        }
        self.models_config.append(new_model)
        return new_model

    async def load_active_model(self, model_id: str):
        """
        Loads a model and tokenizer into active memory, replacing any previously loaded model.
        Includes VRAM cleanup for Apple Silicon.
        """
        async with self.generation_lock:
            await self._load_model_impl(model_id)

    async def _load_model_impl(self, model_id: str):
        """Internal model loading without lock (caller must hold the lock)."""
        if self.active_model_id == model_id and self.active_model and self.active_tokenizer:
            logger.info(f"Model {model_id} is already active.")
            return

        # 0. VRAM Cleanup
        if self.active_model:
            logger.info(f"Unloading previous model {self.active_model_id}...")
            self.active_model = None
            self.active_tokenizer = None
            self.active_model_id = None
            gc.collect()
            mx.metal.clear_cache()
            logger.info("VRAM cache cleared.")

        logger.info(f"Loading model: {model_id}")
        
        # 1. Resolve Path
        path_to_load = model_id
        if Path(model_id).is_absolute() and Path(model_id).exists():
             path_to_load = model_id
        else:
            sanitized_name = model_id.replace("/", "--")
            local_path = self.models_dir / sanitized_name
            if (local_path / ".completed").exists() or local_path.exists():
                path_to_load = str(local_path.absolute())
        
        # Final safety check: ensure path is absolute
        p = Path(path_to_load)
        if not p.is_absolute():
            # If not absolute and not found in models_dir, it might be a HuggingFace ID
            # mlx_lm.load handles HF IDs, but we prefer local absolute paths if they exist
            logger.warning(f"Loading via ID or relative path: {path_to_load}")
        else:
            path_to_load = str(p.absolute())

        logger.info(f"Loading from: {path_to_load}")

        loop = asyncio.get_running_loop()
        try:
            model, tokenizer = await loop.run_in_executor(None, load, path_to_load)
            
            self.active_model_id = model_id
            self.active_model = model
            self.active_tokenizer = tokenizer
            logger.info(f"Model {model_id} loaded and set as active.")
        except Exception as e:
            logger.error(f"Failed to load model {model_id}: {e}")
            raise

    def get_active_model_metadata(self) -> Dict[str, Any]:
        """Returns metadata for the currently loaded model, including numeric context_window."""
        if not self.active_model_id:
            return {}
        # Find model in config
        for m in self.models_config:
            if m["id"] == self.active_model_id:
                cw_str = m.get("context_window", "Unknown")
                cw_num = None
                if cw_str and cw_str != "Unknown":
                    import re
                    match = re.match(r"^(\d+)k$", cw_str, re.IGNORECASE)
                    if match:
                        cw_num = int(match.group(1)) * 1024
                    else:
                        try:
                            cw_num = int(cw_str)
                        except ValueError:
                            pass
                return {
                    "context_window": cw_num,
                    "architecture": m.get("architecture"),
                    "quantization": m.get("quantization"),
                }
        return {}

    def unload_model(self):
        """Explicitly unload the active model and free VRAM."""
        if self.active_model:
            logger.info(f"Unloading model {self.active_model_id}...")
            self.active_model = None
            self.active_tokenizer = None
            self.active_model_id = None
            gc.collect()
            mx.metal.clear_cache()
            logger.info("Model unloaded and VRAM cache cleared.")
        else:
            logger.info("No model currently loaded.")

    def stop_generation(self):
        """Sets the stop event to interrupt MLX generation."""
        self.stop_event.set()
        logger.info("Stop signal sent to generation loop.")

    async def generate_stream(self, model_id: str, messages: list, **kwargs):
        """
        Token-by-token streaming inference via SSE.
        """
        async with self.generation_lock:
            try:
                # 1. Ensure model is loaded
                if self.active_model_id != model_id:
                    await self._load_model_impl(model_id)
                
                model = self.active_model
                tokenizer = self.active_tokenizer
                if not model or not tokenizer:
                    yield {"error": "Model not loaded"}
                    return

                # 2. Prepare Prompt
                if hasattr(tokenizer, "apply_chat_template"):
                    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                else:
                    prompt = messages[-1]['content']

                # 3. Reset Stop Event
                self.stop_event.clear()

                # 4. Stream Generation
                temp = kwargs.get("temperature", 0.7)
                max_tokens = kwargs.get("max_tokens", 512)
                top_p = kwargs.get("top_p", 0.9)
                repetition_penalty = kwargs.get("repetition_penalty", 1.1)

                loop = asyncio.get_running_loop()
                
                # MLX generate is a generator, we run it in a thread and yield tokens
                def _generate_iter():
                    from mlx_lm import stream_generate
                    from mlx_lm.sample_utils import make_sampler, make_logits_processors

                    sampler = make_sampler(temp=temp, top_p=top_p)
                    logits_processors = make_logits_processors(repetition_penalty=repetition_penalty)

                    for response in stream_generate(
                        model, 
                        tokenizer, 
                        prompt=prompt, 
                        max_tokens=max_tokens, 
                        sampler=sampler,
                        logits_processors=logits_processors
                    ):
                        if self.stop_event.is_set():
                            break
                        # response is a GenerationResponse dataclass with .text, .generation_tps, etc.
                        yield response.text

                # Iterate over the blocking generator in an executor
                # We use a sentinel to avoid StopIteration issues with asyncio futures
                _SENTINEL = object()
                
                def _next_token(gen):
                    try:
                        return next(gen)
                    except StopIteration:
                        return _SENTINEL
                
                gen = _generate_iter()
                while True:
                    token_text = await loop.run_in_executor(None, _next_token, gen)
                    if token_text is _SENTINEL:
                        break
                    yield {"text": token_text, "done": False}
                
                yield {"text": "", "done": True}

            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield {"error": str(e)}

    async def generate_response(self, model_id: str, messages: list, **kwargs) -> Dict[str, Any]:
        """
        Legacy wrapper for generate_stream to return a full object.
        """
        full_text = ""
        async for chunk in self.generate_stream(model_id, messages, **kwargs):
            if "text" in chunk:
                full_text += chunk["text"]
        return {"role": "assistant", "content": full_text}

    async def start_finetuning(self, job_id: str, config: Dict[str, Any]):
        job_name = config.get("job_name", "")
        logger.debug(f"SERVICE: start_finetuning job_name='{job_name}' for job_id={job_id}")
        self.active_jobs[job_id] = {
            "status": "starting", 
            "progress": 0, 
            "job_name": job_name,
            "job_id": job_id # Store ID as well for easy access
        }
        
        # Spawn a thread for training so we don't block the API
        thread = threading.Thread(target=self._run_training_job, args=(job_id, config))
        thread.start()
        
        return {"job_id": job_id, "status": "started", "job_name": job_name}

    def _run_training_job(self, job_id: str, config: Dict):
        """
        Executed in a separate thread.
        """
        try:
            self.active_jobs[job_id]["status"] = "training"
            model_id = config.get("model_id")
            dataset_path = config.get("dataset_path")
            epochs = int(config.get("epochs", 3))
            lr = float(config.get("learning_rate", 1e-4))
            
            # New Params
            batch_size = int(config.get("batch_size", 1))
            lora_rank = int(config.get("lora_rank", 8))
            lora_alpha = float(config.get("lora_alpha", 16))
            max_seq_length = int(config.get("max_seq_length", 512))
            lora_dropout = float(config.get("lora_dropout", 0.0))
            lora_layers = int(config.get("lora_layers", 8))
            
            # Create dedicated directory for this job
            job_adapter_dir = self.adapters_dir / job_id
            job_adapter_dir.mkdir(parents=True, exist_ok=True)
            
            adapter_file = job_adapter_dir / "adapters.safetensors"

            logger.info(f"Starting training job {job_id} for model {model_id}...")
            logger.info(f"Params: Epochs={epochs}, BS={batch_size}, Rank={lora_rank}, Alpha={lora_alpha}, LR={lr}, Dropout={lora_dropout}")

            # 1. Load Model (fresh load for training recommended to avoid state issues)
            # For efficiency we could reuse, but freezing/lora modification happens in-place.
            # RENAME config -> model_config to avoid shadowing the function argument 'config'
            model, tokenizer, model_config = load(model_id, return_config=True)
            
            # Freeze the base model
            model.freeze()

            # 2. Setup Training Arguments
            from mlx_lm.tuner.datasets import load_local_dataset, CacheDataset
            import shutil

            # Fix: load_local_dataset expects a directory containing 'train.jsonl'.
            # It ignores the filename of dataset_path if we just pass the parent directory.
            # We must create a temporary directory for this job and copy the user's file to 'train.jsonl' there.
            
            job_data_dir = job_adapter_dir / "data"
            job_data_dir.mkdir(exist_ok=True, parents=True)
            
            target_train_path = job_data_dir / "train.jsonl"
            try:
                shutil.copy(dataset_path, target_train_path)
                logger.info(f"Staged dataset {dataset_path} to {target_train_path}")
            except Exception as e:
                logger.error(f"Error copying dataset: {e}")
                # Fallback? No, likely fatal.
            
            # Note: load_local_dataset returns (train, val, test) tuple
            train_set, val_set, test_set = load_local_dataset(job_data_dir, tokenizer, model_config)
            
            # --- FIX FOR EMPTY VALIDATION SET ---
            # If user provides only train.jsonl, val_set is empty list. Train loop crashes.
            if len(val_set) == 0:
                logger.info("Validation set empty. Splitting train set...")
                # Access raw data: load_local_dataset returns [ChatDataset(...), ...]
                # ChatDataset wraps a list in self._data
                if hasattr(train_set, "_data"):
                    raw_data = train_set._data
                else:
                    raw_data = train_set # Fallback if list
                
                # Split logic
                if len(raw_data) > 1:
                    split_idx = int(len(raw_data) * 0.9)
                    if split_idx == len(raw_data): split_idx = len(raw_data) - 1
                    
                    train_raw = raw_data[:split_idx]
                    val_raw = raw_data[split_idx:]
                    
                    # Re-create datasets
                    from mlx_lm.tuner.datasets import create_dataset
                    train_set = create_dataset(train_raw, tokenizer, model_config)
                    val_set = create_dataset(val_raw, tokenizer, model_config)
                else:
                    # Too small to split, duplicate
                    logger.info("Train set too small (<=1). Duplicating for validation.")
                    # Note: Using same object might cause issues if modified? Safe to reuse for MVP
                    train_set = train_set
                    val_set = train_set 

            # IMPORTANT: ChatDataset returns raw dicts. Trainer expects processed tuples.
            # We must wrap them in CacheDataset which calls .process()
            train_set = CacheDataset(train_set)
            val_set = CacheDataset(val_set)
            
            # Calculate total iterations
            # Steps per epoch = len(train_set) / batch_size
            steps_per_epoch = len(train_set) // batch_size
            if steps_per_epoch < 1: steps_per_epoch = 1
            total_iters = steps_per_epoch * epochs
            
            logger.info(f"Training Plan: {len(train_set)} samples, {steps_per_epoch} steps/epoch, {total_iters} total iters.")

            args = TrainingArgs(
                batch_size=batch_size, 
                iters=total_iters, 
                adapter_file=str(adapter_file),
                max_seq_length=max_seq_length
            )

            # Define a callback class to update progress
            class ProgressCallback:
                def on_train_loss_report(self_, train_info):
                    if "iteration" in train_info:
                        step = train_info["iteration"]
                        prog = int((step / args.iters) * 100)
                        self.active_jobs[job_id]["progress"] = prog

                def on_val_loss_report(self_, val_info):
                    # We can log validation loss if we want, or just ignore
                    pass

            progress_callback = ProgressCallback()

            # 3. Run Training
            # Note: mlx_lm.tuner.train signature: 
            # train(model, optimizer, train_dataset, val_dataset, args, training_callback=...)
            
            # We need to construction the optimizer
            import mlx.optimizers as optim
            optimizer = optim.Adam(learning_rate=lr)
            
            # We need to convert to LoRA
            from mlx_lm.tuner.utils import linear_to_lora_layers

            # Define LoRA config
            # Use user-defined layers count
            
            lora_config = {
                "rank": lora_rank,
                "alpha": lora_alpha,
                "scale": float(lora_alpha / lora_rank), # alpha / rank
                "dropout": lora_dropout,
                "keys": ["self_attn.q_proj", "self_attn.v_proj"], # Common keys for LoRA
                "num_layers": lora_layers # User defined
            }
            
            # Note: num_layers=N means adapt the last N layers
            # linear_to_lora_layers modifies model in-place and returns None!
            linear_to_lora_layers(model, lora_config["num_layers"], lora_config)
            
            logger.info("Model converted to LoRA.")

            train(
                model=model,
                optimizer=optimizer,
                train_dataset=train_set,
                val_dataset=val_set,
                args=args,
                training_callback=progress_callback
            )

            self.active_jobs[job_id]["status"] = "completed"
            self.active_jobs[job_id]["model_path"] = str(adapter_file)
            self.active_jobs[job_id]["progress"] = 100
            
            # --- Auto-Register Fine-Tuned Model ---
            job_name = config.get("job_name")
            if not job_name or not job_name.strip():
                job_name = f"Fine-Tune {job_id[:8]}"
            
            # --- SAVE METADATA TO ADAPTER DIR (User Request) ---
            metadata_path = job_adapter_dir / "metadata.json"
            metadata = {
                "job_name": job_name,
                "job_id": job_id,
                "base_model": model_id,
                "params": config
            }
            
            # --- SAVE ADAPTER CONFIG (Required for Inference) ---
            adapter_config_path = job_adapter_dir / "adapter_config.json"
            
            # Enrich lora_config with base model info
            base_model_type = "llama" # Default
            if hasattr(model_config, "model_type"):
                base_model_type = model_config.model_type
            elif isinstance(model_config, dict) and "model_type" in model_config:
                base_model_type = model_config["model_type"]

            # MLX-LM expects a specific structure for adapter config
            # Based on errors: needs 'num_layers' and 'lora_parameters'
            final_adapter_config = {
                "num_layers": lora_config["num_layers"],
                "model_type": base_model_type,
                "base_model_name_or_path": model_id,
                "lora_parameters": {
                    "rank": lora_config["rank"],
                    "alpha": lora_config["alpha"],
                    "scale": lora_config["scale"],
                    "dropout": lora_config["dropout"],
                    "keys": lora_config["keys"]
                }
            }

            try:
                # Save metadata
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=4)
                    
                # Save adapter config
                with open(adapter_config_path, 'w') as f:
                    json.dump(final_adapter_config, f, indent=4)
                    
            except Exception as e:
                logger.error(f"Failed to save metadata or adapter config: {e}")

            ft_model_entry = {
                "id": f"ft-{job_id}", # Unique ID for the fine-tuned model
                "name": job_name,
                "base_model": model_id,
                "adapter_path": str(job_adapter_dir), # Point to directory for MLX load
                "size": "Adapter", # Or calculate size?
                "family": "Custom",
                "is_custom": True,
                "is_finetuned": True,
                "params": {
                    "epochs": epochs,
                    "batch_size": batch_size,
                    "lora_rank": lora_rank,
                    "lora_alpha": lora_alpha,
                    "learning_rate": lr,
                    "max_seq_len": max_seq_length,
                    "dropout": lora_dropout,
                    "lora_layers": lora_layers
                }
            }
            self.models_config.append(ft_model_entry)
            self._save_models_config()
            logger.info(f"Registered fine-tuned model: {ft_model_entry['name']}")
            
        except Exception as e:
            logger.error(f"Training failed: {e}", exc_info=True)
            self.active_jobs[job_id]["status"] = "failed"
            self.active_jobs[job_id]["error"] = str(e)

    def get_job_status(self, job_id: str):
        return self.active_jobs.get(job_id, {"status": "not_found"})

    def get_model_format_info(self, model_id: str) -> Dict[str, Any]:
        """Detect chat template format, EOS tokens, and model type for a model.

        Returns info like model_type, chat_template presence, EOS token, etc.
        so the UI can show users what format their training data will use.
        """
        model_entry = self._get_model_config_by_id(model_id)
        if not model_entry:
            return {"error": "Model not found"}

        info: Dict[str, Any] = {
            "model_id": model_id,
            "model_type": "unknown",
            "has_chat_template": False,
            "chat_template_preview": None,
            "eos_token": None,
            "bos_token": None,
            "pad_token": None,
        }

        # Find model path
        model_path = None
        if model_entry.get("is_finetuned") and model_entry.get("adapter_path"):
            # For fine-tuned models, use base model
            base_id = model_entry.get("base_model", "")
            base_entry = self._get_model_config_by_id(base_id)
            if base_entry:
                model_entry = base_entry
            else:
                return info

        if Path(model_entry["id"]).is_absolute():
            p = Path(model_entry["id"])
            if p.exists():
                model_path = p
        else:
            sanitized = model_entry["id"].replace("/", "--")
            p = self.models_dir / sanitized
            if p.exists():
                model_path = p

        if not model_path:
            return info

        # Read config.json for model_type
        config_path = model_path / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r") as f:
                    config = json.load(f)
                info["model_type"] = config.get("model_type", "unknown")
            except Exception:
                pass

        # Read tokenizer_config.json for chat template and special tokens
        tok_config_path = model_path / "tokenizer_config.json"
        if tok_config_path.exists():
            try:
                with open(tok_config_path, "r") as f:
                    tok_config = json.load(f)

                # Chat template
                if "chat_template" in tok_config:
                    info["has_chat_template"] = True
                    template = tok_config["chat_template"]
                    # Preview: first 200 chars
                    if isinstance(template, str):
                        info["chat_template_preview"] = template[:200]

                # Special tokens
                eos = tok_config.get("eos_token")
                if isinstance(eos, dict):
                    eos = eos.get("content", str(eos))
                info["eos_token"] = eos

                bos = tok_config.get("bos_token")
                if isinstance(bos, dict):
                    bos = bos.get("content", str(bos))
                info["bos_token"] = bos

                pad = tok_config.get("pad_token")
                if isinstance(pad, dict):
                    pad = pad.get("content", str(pad))
                info["pad_token"] = pad

            except Exception:
                pass

        return info

    def _get_model_config_by_id(self, model_id: str):
        for m in self.models_config:
            if m["id"] == model_id:
                return m
        return None

    def get_models_status(self):
        """
        Returns the list of supported models with their local download status.
        Uses self.models_config which includes custom registered models.
        """
        models = []
        for m in self.models_config:
            # Check if model exists locally
            
            is_downloaded = False
            model_path = None
            is_downloading = m["id"] in self.active_downloads
            
            # 1. Custom Path? (Legacy custom registration)
            if "is_finetuned" in m and m["is_finetuned"]:
                 is_downloaded = True # Always "downloaded" if it's a local fine-tune
            elif Path(m["id"]).is_absolute():
                if Path(m["id"]).exists():
                    is_downloaded = True
                    model_path = str(Path(m["id"]))
                    
                    # Backfill size if missing or 'Custom'
                    if m.get("size") == "Custom":
                        logger.info(f"Backfilling size for {m['name']}")
                        new_size = self._get_dir_size_str(Path(m["id"]))
                        m["size"] = new_size # Update in memory
                        # We should save this back to JSON so we don't recalc every second
                        # But loop overhead to save inside loop is bad. 
                        # We can defer save? For now just in-memory update is visible to UI.
                        
            else:
                # 2. Standard Downloaded Model
                sanitized_name = m["id"].replace("/", "--")
                local_path = self.models_dir / sanitized_name
                # Only check for follow-up .completed file
                if (local_path / ".completed").exists():
                    is_downloaded = True
                    model_path = str(local_path)
            
            entry = {
                **m,
                "downloaded": is_downloaded,
                "downloading": is_downloading, 
                "local_path": model_path
            }
            
            # --- Metadata Recovery Logic ---
            # If name looks like generic ID and it's a fine-tune, try to read metadata.json
            if entry["name"].startswith("Fine-Tune ") and "adapter_path" in m:
                try:
                    adapter_dir = Path(m["adapter_path"])
                    meta_path = adapter_dir / "metadata.json"
                    if meta_path.exists():
                        with open(meta_path, 'r') as f:
                            meta = json.load(f)
                            if "job_name" in meta and meta["job_name"]:
                                entry["name"] = meta["job_name"]
                                m["name"] = meta["job_name"]
                except Exception as e:
                    logger.debug(f"Could not read metadata for {m.get('name')}: {e}")

            models.append(entry)
        return models

    def download_model(self, model_id: str):
        """
        Downloads a model to the local models directory.
        This is a blocking operation (run in Bg Task), handles markers.
        """
        if model_id in self.active_downloads:
            logger.info(f"Model {model_id} already downloading.")
            return

        self.active_downloads.add(model_id)
        try:
            from huggingface_hub import snapshot_download
            
            logger.info(f"Downloading {model_id} to {self.models_dir}...")
            sanitized_name = model_id.replace("/", "--")
            local_dir = self.models_dir / sanitized_name
            
            # Remove partial .completed if it exists (shouldn't, but safety)
            marker_file = local_dir / ".completed"
            if marker_file.exists():
                os.remove(marker_file)
            
            snapshot_download(
                repo_id=model_id,
                local_dir=local_dir,
                local_dir_use_symlinks=False,
                # Force allowing patterns if needed? Default is all.
            )
            
            # Write marker file
            with open(marker_file, 'w') as f:
                f.write("ok")
                
            logger.info(f"Successfully downloaded {model_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to download {model_id}: {e}")
            raise
        finally:
            self.active_downloads.discard(model_id)
            
    def delete_model(self, model_id: str):
        """
        Deletes a local model from disk.
        Handles both standard downloaded models and custom registered models.
        """
        try:
            # Check if it's a custom/finetuned model in config
            config_entry = self._get_model_config_by_id(model_id)
            
            if config_entry and config_entry.get("is_custom"):
                logger.info(f"Deleting custom model: {model_id} ({config_entry['name']})")
                
                # 1. Remove from config
                self.models_config = [m for m in self.models_config if m["id"] != model_id]
                self._save_models_config()
                
                # 2. Delete files if it's a fine-tune (adapter path)
                if config_entry.get("is_finetuned") and "adapter_path" in config_entry:
                    adapter_path = Path(config_entry["adapter_path"])
                    if adapter_path.exists() and adapter_path.is_dir():
                        import shutil
                        logger.info(f"Removing adapter directory: {adapter_path}")
                        shutil.rmtree(adapter_path)
                
                # 3. Delete files if it's a User Added Foundation Model (Absolute Path)
                elif Path(model_id).is_absolute() and Path(model_id).exists():
                     target_path = Path(model_id)
                     # SAFETY CHECK: Only delete if path is under home directory and is a real model dir
                     home = Path.home()
                     if target_path.is_relative_to(home) and target_path.is_dir():
                         import shutil
                         logger.info(f"Removing user model directory: {target_path}")
                         shutil.rmtree(target_path)
                     else:
                         logger.warning(f"Skipping disk deletion for safety (not under home): {target_path}")

                return True

            # Standard Downloaded Model Logic
            sanitized_name = model_id.replace("/", "--")
            local_dir = self.models_dir / sanitized_name
            
            if local_dir.exists():
                logger.info(f"Deleting foundation model {model_id} at {local_dir}")
                import shutil
                shutil.rmtree(local_dir)
                return True
            else:
                logger.info(f"Model {model_id} not found at {local_dir}")
                return False
        except Exception as e:
            logger.error(f"Failed to delete {model_id}: {e}")
            raise

    async def export_model(self, model_id: str, output_path: str, q_bits: int = 4):
        """Fuse adapters with base model and apply quantization."""
        config = self._get_model_config_by_id(model_id)
        if not config:
            raise ValueError("Model not found")
        
        base_model = config["base_model"] if config.get("is_finetuned") else model_id
        adapter_path = config.get("adapter_path")
        
        logger.info(f"Exporting model {model_id} to {output_path} (Quant: {q_bits} bits)...")

        from mlx_lm import fuse

        # fuse() handles quantization if q_bits is provided
        # q_bits=0 means full precision (no quantization)
        loop = asyncio.get_running_loop()
        try:
            fuse_kwargs = {
                "model": base_model,
                "adapter_path": adapter_path,
                "save_path": output_path,
            }
            if q_bits and q_bits > 0:
                fuse_kwargs["q_bits"] = q_bits
            await loop.run_in_executor(None, lambda: fuse(**fuse_kwargs))
            logger.info(f"Model exported successfully to {output_path}")
            return {"status": "success", "path": output_path}
        except Exception as e:
            logger.error(f"Export failed: {e}")
            raise e
