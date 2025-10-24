// Example environment configuration for AI models and backend API
export const ENVIRONMENT = {
    // Default AI model provider
    DEFAULT_MODEL: "gemini-1.5-pro",
  
    // === 🔑 API KEYS ===
    GEMINI_API_KEY: "AIzaSyAO9eZY-erXSXQ9wVqkeOMz26BTmisLubI", // your real Gemini key
    GROQ_API_KEY: "gsk_your-groq-key",
    OPENAI_API_KEY: "sk-proj-your-openai-key",
  
    // === 🌐 Backend Flask API ===
    API_BASE_URL: import.meta.env.VITE_API_URL || "/api",
  };
  