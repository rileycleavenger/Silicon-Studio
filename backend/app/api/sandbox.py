import uuid
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
from app.sandbox.service import SandboxService

router = APIRouter()
service = SandboxService()


class RunRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50000)
    language: str = ""
    timeout: Optional[int] = Field(default=None, ge=1, le=60)


class CheckRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50000)
    language: str = ""


class KillRequest(BaseModel):
    run_id: str


@router.post("/check")
async def check_syntax(req: CheckRequest):
    return await service.check(code=req.code, language=req.language)


@router.post("/run")
async def run_code(req: RunRequest):
    run_id = str(uuid.uuid4())
    result = await service.run(
        code=req.code,
        language=req.language,
        timeout=req.timeout,
        run_id=run_id,
    )
    result["run_id"] = run_id
    return result


@router.post("/kill")
async def kill_run(req: KillRequest):
    killed = await service.kill(req.run_id)
    return {"killed": killed}
