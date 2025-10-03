/*
  # Create match_documents_interface function for vector search

  1. New Function
    - `match_documents_interface` - Vector similarity search function
    - Takes query_embedding (384-dimensional vector)
    - Returns documents with similarity scores
    - Uses HNSW index for fast search

  2. Performance Optimizations
    - Sets ef_search to 60 for good recall/speed balance
    - Uses cosine similarity for matching
    - Supports project filtering and metadata filtering
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS match_documents_interface(vector(384), integer, text, float, jsonb);

-- Create the vector search function
CREATE OR REPLACE FUNCTION match_documents_interface(
  query_embedding vector(384),
  match_count integer DEFAULT 8,
  p_project_id text DEFAULT NULL,
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
  -- Set HNSW search parameters for better recall
  PERFORM set_config('hnsw.ef_search', '60', true);
  
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    (1 - (documents.embedding <=> query_embedding)) AS similarity
  FROM documents
  WHERE 
    documents.embedding IS NOT NULL
    AND (1 - (documents.embedding <=> query_embedding)) >= min_similarity
    AND (meta_filter IS NULL OR documents.metadata @> meta_filter)
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;