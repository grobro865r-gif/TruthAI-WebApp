# TruthAI Web App

A multi-provider AI chat website with:
- OpenAI Responses API
- OpenAI web search grounding
- Google Gemini + Google Search grounding
- Source links/citations in the UI
- File upload for text/markdown/code files
- AI image generation endpoint
- Provider/model selection
- Local chat history in the browser
- Dark, responsive interface
- Roman Urdu-friendly interface and answers

## Important
No AI can honestly guarantee that every answer is always true. This app uses a truth-first instruction:
1. Search the web for current, niche, changing, or uncertain facts.
2. Prefer primary/official sources where possible.
3. Give source links when web grounding is used.
4. Clearly say when evidence is incomplete or conflicting.
5. Never invent citations, facts, quotes, or tool results.

## Setup

1. Install Node.js 20+.
2. Open this folder in a terminal.
3. Run:
   npm install
4. Copy `.env.example` to `.env`.
5. Add at least one API key:
   - `OPENAI_API_KEY` for OpenAI.
   - `GEMINI_API_KEY` for Gemini.
6. Run:
   npm start
7. Open:
   http://localhost:3000

## API keys
The project intentionally does NOT contain a working API key. Put your own keys in `.env`.
Do not put secret keys in `public/` files.

## Notes
- OpenAI web search is billed according to OpenAI's current API pricing.
- Gemini Google Search grounding is billed according to Google's current Gemini pricing/terms.
- Image generation requires an OpenAI API key and may incur separate API charges.
- The app is a starter product, not a promise of factual perfection.

## Main files
- `server.js` - backend and AI provider integrations
- `public/index.html` - app UI
- `public/app.js` - frontend logic
- `public/styles.css` - design
- `.env.example` - configuration template
