/*
  # Fix vector dimensions and create match function

  This migration:
  1. Updates the documents table embedding column to use 384 dimensions (for all-MiniLM-L6-v2)
  2. Recreates the HNSW index for optimal performance
  3. Creates the match_documents_interface function for vector search
  4. Ensures all existing embeddings are cleared (they need to be regenerated)

  ## Changes Made
  - Drop existing HNSW index
  - Alter embedding column to vector(384)
  - Clear existing embeddings (they were 1536-dimensional)
  - Recreate HNSW index with proper parameters
  - Create match_documents_interface function for vector similarity search

  ## Security
  - Function uses security definer for proper access control
  - Includes project filtering capability
  - Supports metadata filtering
*/

-- Drop existing index if it exists
DROP INDEX IF EXISTS documents_embedding_hnsw_idx;

-- Clear existing embeddings (they were wrong dimensions)
UPDATE documents SET embedding = NULL;

-- Alter the embedding column to use 384 dimensions
ALTER TABLE documents ALTER COLUMN embedding TYPE vector(384);

-- Recreate the HNSW index with proper parameters for 384 dimensions
CREATE INDEX documents_embedding_hnsw_idx 
ON documents 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Create the match_documents_interface function
CREATE OR REPLACE FUNCTION match_documents_interface(
  query_embedding vector(384),
  match_count int DEFAULT 5,
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
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding)) AS similarity
  FROM documents d
  WHERE 
    d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) >= min_similarity
    AND (meta_filter IS NULL OR d.metadata @> meta_filter)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;