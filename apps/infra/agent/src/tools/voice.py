"""
Voice Tools - Text-to-Speech (Polly) and Speech-to-Text (Transcribe).

Enables real-time voice conversation practice for language learning.
"""

import base64
import json
import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from strands.tools import tool

logger = logging.getLogger(__name__)

_polly_client = None
_transcribe_client = None

# Polly voice IDs mapped to language codes
LANGUAGE_VOICES = {
    "Spanish": {"voice_id": "Lucia", "language_code": "es-ES", "engine": "neural"},
    "French": {"voice_id": "Lea", "language_code": "fr-FR", "engine": "neural"},
    "German": {"voice_id": "Vicki", "language_code": "de-DE", "engine": "neural"},
    "Italian": {"voice_id": "Bianca", "language_code": "it-IT", "engine": "neural"},
    "Portuguese": {"voice_id": "Camila", "language_code": "pt-BR", "engine": "neural"},
    "Japanese": {"voice_id": "Kazuha", "language_code": "ja-JP", "engine": "neural"},
    "Korean": {"voice_id": "Seoyeon", "language_code": "ko-KR", "engine": "neural"},
    "Mandarin Chinese": {"voice_id": "Zhiyu", "language_code": "cmn-CN", "engine": "neural"},
    "Arabic": {"voice_id": "Hala", "language_code": "arb", "engine": "neural"},
    "Hindi": {"voice_id": "Kajal", "language_code": "hi-IN", "engine": "neural"},
}

# Transcribe language codes
TRANSCRIBE_LANGUAGES = {
    "Spanish": "es-ES",
    "French": "fr-FR",
    "German": "de-DE",
    "Italian": "it-IT",
    "Portuguese": "pt-BR",
    "Japanese": "ja-JP",
    "Korean": "ko-KR",
    "Mandarin Chinese": "zh-CN",
    "Arabic": "ar-SA",
    "Hindi": "hi-IN",
    "English": "en-US",
}


def _get_polly():
    global _polly_client
    if _polly_client is None:
        _polly_client = boto3.client("polly", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _polly_client


def _get_transcribe():
    global _transcribe_client
    if _transcribe_client is None:
        _transcribe_client = boto3.client("transcribe", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _transcribe_client


@tool
def text_to_speech(text: str, language: str) -> str:
    """
    Convert text to speech audio using Amazon Polly with a native speaker voice.

    Use this when the student wants to hear pronunciation of words, phrases,
    or full sentences in the target language.

    Args:
        text: The text to convert to speech (in the target language).
        language: The target language name (e.g., "Spanish", "French").

    Returns:
        JSON string with base64-encoded audio data and metadata, or an error message.
    """
    voice_config = LANGUAGE_VOICES.get(language)
    if not voice_config:
        return json.dumps({
            "error": f"Voice not available for {language}. Supported: {', '.join(LANGUAGE_VOICES.keys())}"
        })

    try:
        polly = _get_polly()
        response = polly.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=voice_config["voice_id"],
            LanguageCode=voice_config["language_code"],
            Engine=voice_config["engine"],
        )

        audio_stream = response["AudioStream"].read()
        audio_b64 = base64.b64encode(audio_stream).decode("utf-8")

        return json.dumps({
            "audio_base64": audio_b64,
            "format": "mp3",
            "language": language,
            "voice": voice_config["voice_id"],
            "text": text,
        })

    except ClientError as e:
        logger.error(f"Polly error: {e}")
        return json.dumps({"error": f"Could not generate speech: {str(e)}"})


@tool
def speech_to_text(audio_base64: str, language: str) -> str:
    """
    Transcribe speech audio to text for evaluating student pronunciation.

    Use this when the student submits a voice recording for pronunciation practice.

    Args:
        audio_base64: Base64-encoded audio data (WAV or MP3 format).
        language: The language being spoken (e.g., "Spanish", "English").

    Returns:
        JSON string with the transcribed text and confidence score.
    """
    lang_code = TRANSCRIBE_LANGUAGES.get(language)
    if not lang_code:
        return json.dumps({
            "error": f"Transcription not available for {language}. Supported: {', '.join(TRANSCRIBE_LANGUAGES.keys())}"
        })

    try:
        # Decode audio
        audio_bytes = base64.b64decode(audio_base64)

        # For real-time transcription, use Transcribe streaming
        # For simplicity, we use the synchronous approach via a temporary S3 upload
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        bucket = os.environ.get("AUDIO_BUCKET", "")

        if not bucket:
            return json.dumps({"error": "AUDIO_BUCKET not configured for speech-to-text."})

        import uuid
        job_name = f"lang-learn-{uuid.uuid4().hex[:12]}"
        s3_key = f"audio-uploads/{job_name}.wav"

        s3.put_object(Bucket=bucket, Key=s3_key, Body=audio_bytes, ContentType="audio/wav")

        transcribe = _get_transcribe()
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={"MediaFileUri": f"s3://{bucket}/{s3_key}"},
            MediaFormat="wav",
            LanguageCode=lang_code,
        )

        # Poll for completion (with timeout)
        import time
        for _ in range(30):
            status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
            job_status = status["TranscriptionJob"]["TranscriptionJobStatus"]
            if job_status in ("COMPLETED", "FAILED"):
                break
            time.sleep(1)

        if job_status == "FAILED":
            return json.dumps({"error": "Transcription failed."})

        # Get transcript
        import urllib.request
        transcript_uri = status["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
        with urllib.request.urlopen(transcript_uri) as resp:
            transcript_data = json.loads(resp.read().decode())

        results = transcript_data.get("results", {})
        transcripts = results.get("transcripts", [])
        text = transcripts[0]["transcript"] if transcripts else ""

        # Get confidence from items
        items = results.get("items", [])
        confidences = [float(item["alternatives"][0].get("confidence", 0)) for item in items if item.get("alternatives")]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        # Cleanup
        try:
            s3.delete_object(Bucket=bucket, Key=s3_key)
            transcribe.delete_transcription_job(TranscriptionJobName=job_name)
        except Exception:
            pass

        return json.dumps({
            "transcription": text,
            "confidence": round(avg_confidence, 2),
            "language": language,
        })

    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return json.dumps({"error": f"Could not transcribe audio: {str(e)}"})
