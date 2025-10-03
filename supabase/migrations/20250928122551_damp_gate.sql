/*
  # Create match_documents function for vector search

  1. New Functions
    - `match_documents` - Performs vector similarity search using HNSW index
      - Uses cosine similarity for matching
      - Supports project filtering
      - Configurable similarity threshold
      - Optimized with HNSW ef_search parameter

  2. Performance Optimizations
    - Sets HNSW ef_search to 60 for good recall/speed balance
    - Uses existing HNSW index on embedding column
    - Efficient filtering with metadata and project_id

  3. Security
    - Function is accessible to authenticated users
    - No RLS bypass needed as it's a search function
*/

-- Create the match_documents function for vector similarity search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  p_project_id uuid DEFAULT NULL,
  min_similarity float DEFAULT 0.0,
  meta_filter jsonb DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set HNSW ef_search for better recall (higher = better recall, slower)
  PERFORM set_config('hnsw.ef_search', '60', true);
  
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    (1 - (documents.embedding <=> query_embedding)) AS similarity
  FROM documents
  WHERE 
    -- Apply similarity threshold
    (1 - (documents.embedding <=> query_embedding)) >= min_similarity
    -- Apply project filter if provided
    AND (p_project_id IS NULL OR documents.metadata->>'project_id' = p_project_id::text)
    -- Apply metadata filter if provided
    AND (meta_filter IS NULL OR documents.metadata @> meta_filter)
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;