from presidio_analyzer import AnalyzerEngine, Registry
from presidio_anonymizer import AnonymizerEngine
from typing import List, Dict
import logging
import spacy

logger = logging.getLogger(__name__)

class PIIShieldService:
    def __init__(self):
        logger.info("Initializing PIIShieldService...")
        try:
            nlp = None
            try:
                import en_core_web_sm
                logger.debug("Found en_core_web_sm module, loading...")
                nlp = en_core_web_sm.load()
            except Exception as e1:
                logger.debug(f"Module load failed: {e1}")
                import sys
                import os
                if getattr(sys, 'frozen', False):
                    try:
                        base_path = sys._MEIPASS
                        model_path = os.path.join(base_path, "en_core_web_sm")
                        if os.path.exists(model_path):
                             logger.debug(f"Loading from frozen path: {model_path}")
                             nlp = spacy.load(model_path)
                        else:
                             logger.debug(f"Model path not found at {model_path}, trying spacy.load")
                             nlp = spacy.load("en_core_web_sm")
                    except Exception as e2:
                         logger.debug(f"Frozen load failed: {e2}")

            if nlp is None:
                 try:
                    nlp = spacy.load("en_core_web_sm")
                 except Exception as e3:
                    logger.warning(f"All spacy load attempts failed. Last error: {e3}")

            if nlp:
                 logger.info("Spacy NLP model loaded successfully.")
                 from presidio_analyzer.nlp_engine import NlpEngineProvider

                 conf_file = {
                    "nlp_engine_name": "spacy",
                    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}]
                 }

                 provider = NlpEngineProvider(nlp_configuration=conf_file)
                 nlp_engine = provider.create_engine()

                 self.analyzer = AnalyzerEngine(nlp_engine=nlp_engine)
                 logger.info("AnalyzerEngine initialized.")

            else:
                 logger.warning("No NLP model loaded. PIIShield will likely fail.")
                 self.analyzer = AnalyzerEngine()

            self.anonymizer = AnonymizerEngine()
            logger.info("PIIShieldService fully initialized.")

        except Exception as e:
            logger.error(f"Failed to init PIIShieldService: {e}", exc_info=True)
            self.analyzer = None
            self.anonymizer = None

    def analyze_text(self, text: str, entities: List[str] = None):
        """
        Analyze text for PII entities.
        """
        if not self.analyzer: raise ValueError("PII Shield not initialized")
        results = self.analyzer.analyze(text=text, entities=entities, language='en')
        return [result.to_dict() for result in results]

    def anonymize_text(self, text: str, entities: List[str] = None):
        """
        Redact PII from text.
        """
        if not self.analyzer or not self.anonymizer: return {"text": text, "items": []}
        
        analyzer_results = self.analyzer.analyze(text=text, entities=entities, language='en')
        anonymized_result = self.anonymizer.anonymize(
            text=text,
            analyzer_results=analyzer_results
        )
        return {
            "text": anonymized_result.text,
            "items": [
                {
                    "start": item.start,
                    "end": item.end,
                    "entity_type": item.entity_type,
                    "text": item.text if hasattr(item, 'text') else None,
                    "operator": item.operator
                } 
                for item in anonymized_result.items
            ]
        }
