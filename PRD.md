## Product Requirements Document (PRD) – Email Client AI

| Attribute | Detail |
| :--- | :--- |
| **Project Name** | Email Client AI: Smart To-do List Inbox |
| **Goal** | Transform email management from chaos into an intelligent, action-oriented task list. |
| **Team** | Hưng, Khánh, Khoa |

---

### 1. Core Problem & Solution

**Problem:** Email overload buries important tasks beneath noise (spam, newsletters).
**Solution:** An AI-powered email client that automatically sorts, prioritizes, and converts emails into trackable tasks.

---

### 2. Key Features (Functional Requirements)

#### 2.1. Smart Bundling & Notifications

| ID | Feature | Description |
| :--- | :--- | :--- |
| FR-1.1 | **Smart Bundles** | AI auto-groups non-urgent emails (Promotions, Newsletters, Notifications). |
| FR-1.2 | **Delivery Windows** | Allows users to schedule notifications for specific bundles (e.g., get newsletters only at 7 AM). |
| FR-1.3 | **Priority Inbox** | Automatically surfaces urgent/important emails to the top. |

#### 2.2. Email-as-Tasks (EaT)

| ID | Feature | Description |
| :--- | :--- | :--- |
| FR-2.1 | **Task Creation** | Convert any email into a tracked task with status (To-do, In-progress, Done). |
| FR-2.2 | **Deadline & Snooze** | Assign deadlines and snooze emails to reappear later. |
| FR-2.3 | **Pinning** | Pin critical email-tasks to the top of the list. |

#### 2.3. AI Services

| ID | Feature | Description |
| :--- | :--- | :--- |
| FR-3.1 | **Email Summary** | AI summarizes long emails and conversation threads. |
| FR-3.2 | **Action Item Extraction** | AI automatically extracts deadlines and required action items. |
| FR-3.3 | **Urgency Scoring** | AI assesses the urgency level of each email. |
| FR-3.4 | **Quick Reply Suggestions** | AI proposes short, contextual replies. |

#### 2.4. Search & Performance

| ID | Feature | Description |
| :--- | :--- | :--- |
| FR-4.1 | **Natural Language Search** | Semantic Search (e.g., "last month's internet bill"). |
| FR-4.2 | **Low Latency** | Search latency **$< 1s$**. AI processing latency **$< 5s$**. |

---

### 3. Key Technical Challenges

* **Prompt Engineering:** Ensuring high accuracy ($\ge 95\%$) in AI classification and precise action item extraction (avoiding Hallucination).
* **Semantic Search:** Implementing **Hybrid Search** (VectorDB + Keyword) for fast, accurate natural language queries over thousands of emails.

---

### 4. Acceptance Criteria

* AI Classification Accuracy **$\ge 95\%$**.
* All latency targets met (Search $<1s$, AI $<5s$).
* Core synchronization and EaT features functional.