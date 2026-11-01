from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Project-root .env (next to pyproject.toml) so `sportgen` works from any working directory; a .env in
# the current directory still takes precedence.
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SPORTGEN_", env_file=(_ROOT_ENV, ".env"), extra="ignore")

    api_key: str = ""
    base_url: str = "https://integrate.api.nvidia.com/v1"
    model: str = "nvidia/nemotron-3-ultra-550b-a55b"
    candidates: int = 5
    # Hidden reasoning for every step (candidates, critic, refine, verify). On for Ultra, off for Lightning (see
    # use_fast). Roughly doubles call time on Ultra: expect 5-8 min per generation.
    think: bool = True
    candidate_temperature: float = 0.85
    timeout_s: float = 600
    verify: bool = True  # re-judge the refined sport (one extra critic call); keep the candidate if refine regressed
    fast_model: str = "nvidia/nemotron-3.5-lightning-30b-a3b"  # `sportgen --fast` / survey answer "fast"
    fast_api_key: str = ""  # optional separate key for the fast engine; falls back to api_key

    def use_fast(self) -> None:
        """Switch to the fast engine. Must run before the first LLM call (the client is cached)."""
        self.model = self.fast_model
        self.think = False
        if self.fast_api_key:
            self.api_key = self.fast_api_key

    @property
    def is_gemini(self) -> bool:
        return "googleapis.com" in self.base_url

    @property
    def is_groq(self) -> bool:
        return "groq.com" in self.base_url

    @property
    def vllm_style(self) -> bool:
        """Nebius / vLLM / NIM / Ollama accept `chat_template_kwargs`; hosted APIs reject unknown fields."""
        u = self.base_url
        return "nebius" in u or "nvidia.com" in u or "localhost" in u or "127.0.0.1" in u


settings = Settings()
