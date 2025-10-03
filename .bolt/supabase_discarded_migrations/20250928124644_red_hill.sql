@@ .. @@
 -- Create the vector search function with proper 384-dimensional support
-CREATE OR REPLACE FUNCTION match_documents(
+CREATE OR REPLACE FUNCTION match_documents_interface(
   query_embedding vector(384),
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
   -- Set HNSW search parameters for better recall
   PERFORM set_config('hnsw.ef_search', '60', true);
   
   RETURN QUERY
   SELECT
     d.id,
     d.content,
     d.metadata,
     (1 - (d.embedding <=> query_embedding)) as similarity
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