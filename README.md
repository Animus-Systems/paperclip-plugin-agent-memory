# Agent Memory + Knowledge Base — Paperclip Plugin

Persistent memory and Knowledge Base for Paperclip agents via [MemOS](https://github.com/MemTensor/MemOS). Agents automatically build evolving knowledge across runs, completed work is indexed into a searchable Knowledge Base, and executive briefs are auto-generated for decomposed tasks.

## How It Works

```
Agent Run Starts
  ├─ Adapter: search MemOS for relevant knowledge → inject into prompt
  ├─ Agent executes (sees prior knowledge, can call save_memory/search_memories)
  └─ Agent Run Ends
      └─ Adapter: send run output to MemOS → extracted into knowledge objects
          └─ Plugin: track activity, update stats
```

MemOS doesn't just store text — it builds a knowledge graph. Each agent's run output gets processed into structured knowledge objects (skills, procedures, experiences, preferences) that evolve over time. Multiple runs on similar topics consolidate into richer objects rather than duplicating entries.

## Architecture

**Two integration layers:**

1. **OpenRouter Adapter** — transparent memory injection/extraction in the agent execution loop
   - Pre-run: searches MemOS, injects relevant knowledge into the system prompt
   - Post-run: sends run output to MemOS for knowledge extraction
   - Agent tools: `save_memory` and `search_memories` available during runs

2. **Paperclip Plugin** (`animusystems.agent-memory`) — UI, events, configuration
   - Dashboard widget with activity feed and knowledge stats
   - Agent detail tab for browsing/searching knowledge per agent
   - Settings page showing MemOS infrastructure and configuration
   - Health check job (every 5 min)
   - `agent.run.finished` event tracking

## Infrastructure

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| MemOS | Built from [MemTensor/MemOS](https://github.com/MemTensor/MemOS) | 8000 | Memory API, knowledge extraction |
| Neo4j | neo4j:5.26.6 | 7474, 7687 | Graph database for knowledge relationships |
| Qdrant | qdrant/qdrant:v1.15.3 | 6333 | Vector database for semantic search (768d) |
| Ollama | Native macOS app | 11434 | Embedding model (nomic-embed-text, Metal GPU) |

**Embedding**: Ollama running natively on macOS (Metal GPU) — `nomic-embed-text:latest` (768 dimensions)
**Chat LLM**: OpenRouter — `gpt-4o-mini` (for MemOS's internal extraction/processing)

## Setup

### Prerequisites

- Paperclip running via Docker Compose
- [MemOS repo](https://github.com/MemTensor/MemOS) cloned locally
- [Ollama](https://ollama.com) installed natively on macOS
- `nomic-embed-text` model pulled: `ollama pull nomic-embed-text:latest`

### Docker Compose

Add to your `docker-compose.yml`:

```yaml
memos:
  build:
    context: /path/to/MemOS
    dockerfile: docker/Dockerfile
  ports:
    - "8000:8000"
  environment:
    - PYTHONPATH=/app/src
    - QDRANT_HOST=qdrant
    - QDRANT_PORT=6333
    - NEO4J_URI=bolt://neo4j:7687
    - NEO4J_AUTH=neo4j/12345678
    - OLLAMA_API_BASE=http://host.docker.internal:11434
  env_file:
    - ./memos.env
  depends_on:
    neo4j:
      condition: service_healthy
    qdrant:
      condition: service_started
  restart: unless-stopped

neo4j:
  image: neo4j:5.26.6
  healthcheck:
    test: ["CMD-SHELL", "wget -q http://localhost:7474 -O /dev/null || exit 1"]
    interval: 2s
    timeout: 10s
    retries: 20
    start_period: 5s
  environment:
    NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes"
    NEO4J_AUTH: "neo4j/12345678"
  restart: unless-stopped

qdrant:
  image: qdrant/qdrant:v1.15.3
  restart: unless-stopped
```

Add `MEMOS_URL: "http://memos:8000"` to the Paperclip server environment.

### MemOS Environment (`memos.env`)

```env
MOS_EMBEDDER_BACKEND=ollama
MOS_EMBEDDER_MODEL=nomic-embed-text:latest
EMBEDDING_DIMENSION=768

MOS_CHAT_MODEL_PROVIDER=openai
OPENAI_API_BASE=https://openrouter.ai/api/v1
OPENAI_API_KEY=<your-openrouter-key>
MOS_CHAT_MODEL=openai/gpt-4o-mini

MEMRADER_MODEL=openai/gpt-4o-mini
MEMRADER_API_KEY=<your-openrouter-key>
MEMRADER_API_BASE=https://openrouter.ai/api/v1
```

### Plugin Installation

```bash
# Build
npm install && npm run build

# Install in Paperclip UI: Settings → Plugins → Install
# Package name: @animusystems/paperclip-plugin-agent-memory
```

## Agent Tools

Agents have three tools available during runs:

- **`recall_memories`** — Search for relevant context from previous runs
- **`store_memory`** — Explicitly save a learning, decision, or fact
- **`search_knowledge`** — Search the Knowledge Base (completed work, uploaded documents, executive briefs)

## Knowledge Base

The Knowledge Base extends the memory system with company-wide searchable knowledge:

- **Auto-indexing** — when any issue is marked "done", the output (title, description, final agent comments) is automatically indexed into MemOS
- **Document upload** — upload company documents (PDFs, contracts, policies) via the dashboard widget or `kb:upload-document` action
- **Executive briefs** — when a parent issue with all subtasks complete is closed, an LLM-generated executive brief is automatically created and posted as a comment
- **`search_knowledge` tool** — any agent can search across all indexed work and uploaded documents

KB entries are stored in MemOS as a dedicated company-scoped user (`kb-{companyId}`), tagged with `[type: knowledge_base]` metadata for filtered search.

## Plugin UI

- **Dashboard Widget: Agent Memory** — MemOS status, knowledge object counts per agent, activity feed
- **Dashboard Widget: Knowledge Base** — KB stats (indexed issues, documents, briefs), search bar with results
- **Agent Memory Tab** — Browse knowledge objects, search, manually add entries
- **Settings Page** — Infrastructure details, stats, plugin configuration (memory + KB settings)

## Development

```bash
npm install
npm run build     # Build worker + manifest + UI
npm run typecheck # Type check without emitting
```

## License

MIT
