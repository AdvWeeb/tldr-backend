# Fuzzy Search Implementation

## Overview

This implementation provides intelligent email search with **advanced typo tolerance** and **partial matching** capabilities using PostgreSQL's `pg_trgm` extension with `word_similarity` and multi-strategy matching.

## Recent Improvements (v2.0)

### 🚀 Enhanced Partial Word Matching

- **Added `word_similarity()` function** for superior partial word detection
- `"gem"` now finds `"gemini"` with **0.75 score** (vs 0.375 previously)
- Better at finding words at the start/end of strings

### 🎯 Improved Typo Tolerance

- Combined `word_similarity()` + `similarity()` using `GREATEST()` for best match
- `"kichen"` finds `"kitchen"` with **0.5 score**
- Multi-strategy approach maximizes recall

### 📊 Optimized Threshold

- Lowered default from **0.3 → 0.2** for more lenient matching
- Balances precision and recall for better user experience

### 🔍 Triple-Layer Matching Strategy

Each field now checks **three conditions** (any match wins):

1. `word_similarity(query, field) > threshold`
2. `similarity(field, query) > threshold`
3. `field ILIKE %query%` (case-insensitive wildcard)

## Features

### ✅ Typo Tolerance

Finds results even with spelling mistakes:

- `"markting"` → matches `"marketing"`
- `"recieve"` → matches `"receive"`
- `"definately"` → matches `"definitely"`

### ✅ Partial Matching

Matches incomplete queries:

- `"Nguy"` → finds `"Nguyễn Văn A"`
- `"John D"` → matches `"John Doe"`
- `"inv"` → finds `"invoice"`, `"invitation"`, etc.

### ✅ Multi-Field Search

Searches across:

- **Subject** (default weight: 40%)
- **Sender** name and email (default weight: 30%)
- **Body/Summary** content (default weight: 30%)

### ✅ Relevance Ranking

Results ordered by combined relevance score (0.0 - 1.0)

## API Usage

### Endpoint

```
GET /v1/emails/search/fuzzy
```

### Query Parameters

| Parameter       | Type   | Default  | Description                                                   |
| --------------- | ------ | -------- | ------------------------------------------------------------- |
| `q`             | string | required | Search query                                                  |
| `threshold`     | number | 0.2      | Minimum similarity (0.0-1.0). Lower = more results            |
| `fields`        | enum   | `all`    | Which fields to search: `subject`, `sender`, `body`, or `all` |
| `mailboxId`     | number | -        | Filter by specific mailbox                                    |
| `page`          | number | 1        | Page number                                                   |
| `limit`         | number | 20       | Results per page (max 100)                                    |
| `subjectWeight` | number | 0.4      | Weight for subject matches (0.0-1.0)                          |
| `senderWeight`  | number | 0.3      | Weight for sender matches (0.0-1.0)                           |
| `bodyWeight`    | number | 0.3      | Weight for body/summary matches (0.0-1.0)                     |

### Example Requests

#### Basic Search

```bash
GET /v1/emails/search/fuzzy?q=markting
```

#### Search with Custom Threshold

```bash
# Strict matching (fewer results)
GET /v1/emails/search/fuzzy?q=invoice&threshold=0.6

# Loose matching (more results)
GET /v1/emails/search/fuzzy?q=meeting&threshold=0.2
```

#### Search Specific Fields

```bash
# Search only in subject
GET /v1/emails/search/fuzzy?q=urgent&fields=subject

# Search only sender
GET /v1/emails/search/fuzzy?q=john&fields=sender
```

#### Custom Field Weights

```bash
# Prioritize subject matches
GET /v1/emails/search/fuzzy?q=report&subjectWeight=0.6&senderWeight=0.2&bodyWeight=0.2
```

#### Pagination

```bash
GET /v1/emails/search/fuzzy?q=project&page=2&limit=50
```

### Response Format

```json
{
  "data": [
    {
      "id": 123,
      "subject": "Marketing Campaign Q4",
      "fromName": "John Doe",
      "fromEmail": "john@example.com",
      "snippet": "Let's discuss the marketing strategy...",
      "receivedAt": "2025-12-10T10:30:00Z",
      "isRead": false,
      "isStarred": true,
      // ... other email fields

      "relevance": 0.85, // Combined score
      "matches": {
        "subject": 0.92, // Subject similarity
        "sender": 0.65, // Sender similarity
        "body": 0.71 // Body/summary relevance
      }
    }
  ],
  "meta": {
    "query": "markting",
    "threshold": 0.3,
    "totalResults": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

## Database Setup

### Migration

Run the migration to enable pg_trgm:

```bash
npm run migration:run
```

This will:

1. Enable `pg_trgm` extension
2. Create trigram indexes on subject and sender fields
3. Create full-text search indexes on body and summary
4. Set default similarity threshold to 0.3

### Manual Setup (Alternative)

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create indexes
CREATE INDEX idx_emails_subject_trgm ON emails USING GIN (subject gin_trgm_ops);
CREATE INDEX idx_emails_fromName_trgm ON emails USING GIN ("fromName" gin_trgm_ops);
CREATE INDEX idx_emails_fromEmail_trgm ON emails USING GIN ("fromEmail" gin_trgm_ops);
CREATE INDEX idx_emails_bodyText_fts ON emails USING GIN (to_tsvector('english', COALESCE("bodyText", '')));
CREATE INDEX idx_emails_aiSummary_fts ON emails USING GIN (to_tsvector('english', COALESCE("aiSummary", '')));
```

## Performance

### Query Performance

With proper indexes:

- Small datasets (<10K emails): ~50-100ms
- Medium datasets (10K-100K): ~100-200ms
- Large datasets (>100K): ~200-500ms

### Optimization Tips

1. **Adjust Threshold**: Higher threshold (0.5-0.7) = faster queries, fewer results
2. **Limit Fields**: Search only specific fields when possible
3. **Use Pagination**: Keep `limit` reasonable (20-50 recommended)
4. **Monitor Index Usage**: Ensure GIN indexes are being used

Check index usage:

```sql
EXPLAIN ANALYZE
SELECT * FROM emails
WHERE similarity(subject, 'marketing') > 0.3;
```

## Threshold Guidelines

| Threshold | Match Quality | Use Case                                              |
| --------- | ------------- | ----------------------------------------------------- |
| 0.1 - 0.2 | Very loose    | Exploratory search, catch all variations              |
| 0.3 - 0.4 | Balanced      | **Recommended default**, good mix of recall/precision |
| 0.5 - 0.6 | Moderate      | More precise results, less typo tolerance             |
| 0.7 - 0.9 | Strict        | Near-exact matches only                               |

## Examples by Use Case

### 1. Typo-Tolerant General Search

```bash
GET /v1/emails/search/fuzzy?q=recieve&threshold=0.3
# Finds: "receive", "received", "receiver"
```

### 2. Finding Sender by Partial Name

```bash
GET /v1/emails/search/fuzzy?q=Nguy&fields=sender&threshold=0.3
# Finds: "Nguyễn Văn A", "nguyen@example.com"
```

### 3. Subject-Only Search with High Precision

```bash
GET /v1/emails/search/fuzzy?q=invoice&fields=subject&threshold=0.6
# Finds only emails with "invoice" or very similar in subject
```

### 4. Broad Content Search

```bash
GET /v1/emails/search/fuzzy?q=meeting&threshold=0.2
# Searches subject, sender, and body for any mention of "meeting"
```

## Troubleshooting

### No Results Returned

- **Threshold too high**: Lower to 0.2-0.3
- **Wrong field**: Try `fields=all`
- **Extension not enabled**: Run migration or check `SELECT * FROM pg_extension WHERE extname = 'pg_trgm'`

### Too Many Irrelevant Results

- **Threshold too low**: Increase to 0.4-0.5
- **Too broad**: Specify `fields` parameter
- **Adjust weights**: Increase weight for most important field

### Slow Queries

- **Check indexes**: `\di` in psql to verify GIN indexes exist
- **Reduce limit**: Use pagination
- **Narrow scope**: Add `mailboxId` filter

## Integration Examples

### Frontend TypeScript

```typescript
interface FuzzySearchParams {
  q: string;
  threshold?: number;
  fields?: 'subject' | 'sender' | 'body' | 'all';
  page?: number;
  limit?: number;
}

async function fuzzySearchEmails(params: FuzzySearchParams) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );

  const response = await fetch(`/v1/emails/search/fuzzy?${queryString}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.json();
}

// Usage
const results = await fuzzySearchEmails({
  q: 'markting',
  threshold: 0.3,
  page: 1,
  limit: 20,
});

// Display with relevance scores
results.data.forEach((email) => {
  console.log(
    `${email.subject} (${(email.relevance * 100).toFixed(0)}% match)`,
  );
  console.log(`  Subject: ${(email.matches.subject * 100).toFixed(0)}%`);
  console.log(`  Sender: ${(email.matches.sender * 100).toFixed(0)}%`);
});
```

### cURL Examples

```bash
# Basic search
curl -X GET "http://localhost:3000/v1/emails/search/fuzzy?q=marketing" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Advanced search with all parameters
curl -X GET "http://localhost:3000/v1/emails/search/fuzzy?q=invoice&threshold=0.4&fields=subject&page=1&limit=10&subjectWeight=0.6&senderWeight=0.2&bodyWeight=0.2" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Technical Details

### Algorithm

1. **Trigram Similarity** (`pg_trgm`): Breaks strings into 3-character sequences for comparison
2. **Full-Text Search** (`tsvector/tsquery`): Provides stemming and language-aware matching
3. **Weighted Scoring**: Combines multiple field scores using configurable weights
4. **Threshold Filtering**: Excludes results below minimum similarity

### Similarity Calculation

```
relevance = (subject_score * 0.4) + (sender_score * 0.3) + (body_score * 0.3)

subject_score = similarity(email.subject, query)
sender_score = max(similarity(fromName, query), similarity(fromEmail, query))
body_score = ts_rank(tsvector(body + summary), tsquery(query))
```

### Index Types

- **GIN (Generalized Inverted Index)**: Used for trigram and full-text search
- **Faster queries** but slightly slower writes
- **Space overhead**: ~20-30% additional storage

## Future Enhancements

- [ ] Multi-language support (currently optimized for English)
- [ ] Synonym matching ("meeting" → "conference")
- [ ] Phrase search ("exact phrase")
- [ ] Date range filtering in fuzzy search
- [ ] Search history and suggestions
- [ ] Machine learning-based ranking

## References

- [PostgreSQL pg_trgm Documentation](https://www.postgresql.org/docs/current/pgtrgm.html)
- [Full-Text Search in PostgreSQL](https://www.postgresql.org/docs/current/textsearch.html)
- [Trigram Similarity Matching](https://www.postgresql.org/docs/current/pgtrgm.html#id-1.11.7.40.7)
