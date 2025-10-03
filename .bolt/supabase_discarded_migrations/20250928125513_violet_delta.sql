/*
  # Fix vector dimensions to match all-MiniLM-L6-v2 model
  
  This migration updates the database to use 384-dimensional vectors
  to match the all-MiniLM-L6-v2 embedding model.
  
  1. Changes
     - Update embedding column from vector(1536) to vector(384)
     - Recreate HNSW index for 384 dimensions
     - Update match_documents_interface function
     - Clear existing embeddings (they need regeneration)
  
  2. Security
     - Maintains existing RLS policies
*/

-- Drop existing index and function
DROP INDEX IF EXISTS documents_embedding_hnsw_idx;
DROP FUNCTION IF EXISTS match_documents_interface;

-- Clear existing embeddings (they're wrong dimensions anyway)
UPDATE documents SET embedding = NULL;

-- Update the embedding column to 384 dimensions
ALTER TABLE documents ALTER COLUMN embedding TYPE vector(384);

-- Create new HNSW index for 384 dimensions
CREATE INDEX documents_embedding_hnsw_idx 
ON documents 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 12, ef_construction = 40);

-- Analyze the table
ANALYZE documents;

-- Create the match_documents_interface function for 384-dimensional vectors
CREATE OR REPLACE FUNCTION match_documents_interface(
  query_embedding vector(384),
  match_count int DEFAULT 8,
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
  -- Set HNSW search parameters for better recall
  PERFORM set_config('hnsw.ef_search', '60', true);
  
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE 
    d.embedding IS NOT NULL
    AND (p_project_id IS NULL OR d.metadata->>'project_id' = p_project_id::text)
    AND (meta_filter IS NULL OR d.metadata @> meta_filter)
    AND (1 - (d.embedding <=> query_embedding)) >= min_similarity
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;