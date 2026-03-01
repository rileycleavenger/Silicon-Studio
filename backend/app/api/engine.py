from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Dict, Any, List
import uuid
import json
import logging
from app.engine.service import MLXEngineService

logger = logging.getLogger(__name__)

router = APIRouter()
service = MLXEngineService()

class FineTuneRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=255)
    dataset_path: str = Field(min_length=1, max_length=1024)
    epochs: int = Field(default=3, ge=1, le=100)
    learning_rate: float = Field(default=1e-4, gt=0, le=1.0)
    batch_size: int = Field(default=1, ge=1, le=64)
    lora_rank: int = Field(default=8, ge=1, le=256)
    lora_alpha: float = Field(default=16.0, gt=0)
    max_seq_length: int = Field(default=512, ge=64, le=32768)
    lora_dropout: float = Field(default=0.0, ge=0.0, le=1.0)
    lora_layers: int = Field(default=8, ge=1, le=128)
    job_name: str = Field(default="", max_length=255)

@router.post("/finetune")
async def start_finetune(request: FineTuneRequest):
    """Start a fine-tuning job."""
    job_id = str(uuid.uuid4())
    logger.info(f"Received finetune request. Job Name: '{request.job_name}'")
    config = request.model_dump()
    result = await service.start_finetuning(job_id, config)
    return result

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a fine-tuning job."""
    status = service.get_job_status(job_id)
    if status["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    return status

@router.get("/models")
async def list_models():
    """List supported base models with their local download status."""
    return service.get_models_status()

class DownloadRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=255)

@router.post("/models/download")
async def download_model(request: DownloadRequest, background_tasks: BackgroundTasks):
    """Trigger a model download in the background."""
    background_tasks.add_task(service.download_model, request.model_id)
    return {"status": "download_started", "model_id": request.model_id}

@router.post("/models/delete")
async def delete_model(request: DownloadRequest):
    """Delete a locally downloaded model."""
    success = service.delete_model(request.model_id)
    if not success:
         raise HTTPException(status_code=404, detail="Model not found or could not be deleted")
    return {"status": "deleted", "model_id": request.model_id}

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    path: str = Field(min_length=1, max_length=1024)
    url: str = Field(default="", max_length=2048)

@router.post("/models/register")
async def register_model(request: RegisterRequest):
    """Register a custom model from a local path."""
    try:
        new_model = service.register_model(request.name, request.path, request.url)
        return new_model
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ScanRequest(BaseModel):
    path: str = Field(min_length=1, max_length=1024)

@router.post("/models/scan")
async def scan_models(request: ScanRequest):
    """Scan a directory for MLX models."""
    try:
        found = service.scan_directory(request.path)
        return found
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class LoadModelRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=255)

@router.post("/models/load")
async def load_model(request: LoadModelRequest):
    """Load a model into active memory (Apple Silicon unified memory)."""
    try:
        await service.load_active_model(request.model_id)
        metadata = service.get_active_model_metadata()
        return {"status": "loaded", "model_id": request.model_id, **metadata}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/models/unload")
async def unload_model():
    """Unload the currently active model and free VRAM."""
    try:
        service.unload_model()
        return {"status": "unloaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ChatRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=255)
    messages: list
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=512, ge=1, le=32768)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    repetition_penalty: float = Field(default=1.1, ge=0.0, le=5.0)

@router.post("/chat")
async def chat_generation(request: ChatRequest):
    """Generate a response from the model with streaming support (SSE)."""
    params = request.model_dump()
    model_id = params.pop("model_id")
    messages = params.pop("messages")

    async def event_generator():
        try:
            async for chunk in service.generate_stream(model_id, messages, **params):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/chat/stop")
async def stop_generation():
    """Stop current generation."""
    service.stop_generation()
    return {"status": "stopped"}

class ExportRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=255)
    output_path: str = Field(min_length=1, max_length=1024)
    q_bits: int = Field(default=4, ge=0, le=16)

@router.post("/models/export")
async def export_model(request: ExportRequest):
    """Export and quantize a model."""
    try:
        result = await service.export_model(request.model_id, request.output_path, request.q_bits)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models/adapters")
async def list_adapters():
    """List fine-tuned models available for export."""
    all_models = service.get_models_status()
    adapters = [m for m in all_models if m.get("is_finetuned")]
    return adapters

@router.get("/models/{model_id:path}/format")
async def get_model_format(model_id: str):
    """Get chat template and token format info for a model.

    Returns model_type, has_chat_template, eos_token, etc. so the UI
    can show users what format their training data will use.
    """
    info = service.get_model_format_info(model_id)
    if "error" in info:
        raise HTTPException(status_code=404, detail=info["error"])
    return info
