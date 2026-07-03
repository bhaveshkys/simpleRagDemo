# Simple-RAG: Building Resilient AI Agent Workflows

A backend-focused portfolio project demonstrating the implementation of a robust **Retrieval-Augmented Generation (RAG)** pipeline and autonomous chat agent. 

By utilizing a terminal-based CLI instead of a web frontend, this project focuses purely on the hard engineering challenges of LLM applications: **data parsing, vector database indexing, context engineering, stateful memory, safety guardrails, and hallucination mitigation**.

---

## 1. System Architecture

The diagram below shows the flow of a customer query through the system:

![Chatbot CLI Demonstration](./images/mermaid-diagram-2026-07-03-213552.svg)

---

## 2. Core Features

*   **Custom Markdown Ingestion**: A standalone NestJS script that chunks markdown text using recursive paragraph splitting with overlap boundaries, generates 768-dimension embeddings, and stores them.
*   **Vector Search Database (`pgvector`)**: Integrates Postgres with the vector extension, utilizing an **HNSW (Hierarchical Navigable Small World)** index for sub-millisecond similarity queries.
*   **Dynamic Customer Profiles**: Every chat session initializes with a randomized customer persona containing traits (Location, Membership Tier, Purchased Item, Purchase Date, Defect Issue, Partner Program status).
*   **Context Isolation & Delimiters**: Enforces strict prompt boundaries using XML delimiters (`<customer_profile>`, `<documentation>`) to prevent the LLM from confusing policy rules with user-provided arguments.
*   **Real-time Streaming**: Streams replies chunk-by-chunk directly to the command line, maximizing responsiveness.

---

## 3. Tech Stack

*   **Backend framework**: NestJS (TypeScript)
*   **Database**: PostgreSQL + `pgvector`
*   **Model Provider**: Google AI Studio (Gemini API)
*   **Models**: 
    *   Embeddings: `text-embedding-004` (768 dimensions)
    *   Chat Generation: `random free openrouter  model `

---

We can use any database as long as it supports vector datatype like chromadb, mongoatlas vector

## 4. Setup & Running the Project

### Prerequisites
Make sure your PostgreSQL instance has `pgvector` installed. If using Docker, use the `pgvector/pgvector` image.

Enable the extension in your database:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Configure your environment variables in `.env`:
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/simple-rag"
GEMINI_API_KEY="AIzaSy..."
OPENROUTER_API_KEY="sk-or-v1-2324344224242..."
```

### Ingesting Policy Documents
Place your markdown files in the `/docs` directory, then run the database ingestion script:
```bash
npx ts-node src/db-ingest.ts
```
![Ingest Command](./images/ingest.png)

### Starting the Chatbot CLI
To start an interactive session with a randomized customer profile:
```bash
npx ts-node src/chat-cli.ts
```
![Chat](./images/chat.png)
---

## 5. Engineering Challenges & Lessons Learned

A major part of building this project was solving three critical vulnerabilities common to production AI applications:

### Challenge 1: The "Goodwill Loophole" (Hallucination)
*   *The Issue*: During testing, the agent noticed that the customer was enrolled in the "Partner Program." Since the customer's purchase was outside their tier's return window, the model hallucinated a "goodwill exception," suggesting their Partner status qualified them for extra favors not stated in the markdown policies.
*   *The Solution*: Implemented **Defensive Prompting**. The system instructions were updated with strict, explicit negation boundaries: *"Under no circumstances does the Partner Program grant return exceptions, refunds, or support escalations. The Partner Program ONLY grants AuraCoins in exchange for data."*

### Challenge 2: Context Reset (Stateless Memory Loss)
*   *The Issue*: When the user replied with short clarifying questions like *"what"* or *"why"*, the agent completely reset its persona, forgetting the past messages because the API call was stateless.
*   *The Solution*: Implemented a **Stateful Memory Array** inside the NestJS service. The backend appends each user query and model reply to a local `chatHistory` array and sends the cumulative transcript back to Gemini's chat API on subsequent turns.

### Challenge 3: Leakage of Chain-of-Thought (Thinking out loud)
*   *The Issue*: The LLM began printing its internal mathematical checks (calculating days, verifying item categories) directly to the customer as conversational output.
*   *The Solution*: Enforced **XML Tag Separation** in the system prompt. The model was instructed to place reasoning inside `<thinking>` tags and replies inside `<output>` tags. The NestJS stream reader was updated to parse these tags in real-time, printing only the `<output>` content to the terminal while reserving the thoughts for backend server logs.
