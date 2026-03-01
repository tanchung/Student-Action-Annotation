-- Migration: Add soft delete columns to PostgreSQL tables
-- Date: 2026-03-01
-- Purpose: Support soft delete functionality for videos and related metadata

-- Add soft delete columns to video_metadata table
ALTER TABLE video_metadata 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add soft delete columns to video_segments table
ALTER TABLE video_segments 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add soft delete columns to activities table
ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Create indexes for better performance on soft delete queries
CREATE INDEX IF NOT EXISTS idx_video_metadata_is_deleted ON video_metadata(is_deleted);
CREATE INDEX IF NOT EXISTS idx_video_segments_is_deleted ON video_segments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_activities_is_deleted ON activities(is_deleted);

-- Add comments to columns for documentation
COMMENT ON COLUMN video_metadata.is_deleted IS 'Soft delete flag - true if record is deleted';
COMMENT ON COLUMN video_metadata.deleted_at IS 'Timestamp when record was soft deleted';
COMMENT ON COLUMN video_segments.is_deleted IS 'Soft delete flag - true if record is deleted';
COMMENT ON COLUMN video_segments.deleted_at IS 'Timestamp when record was soft deleted';
COMMENT ON COLUMN activities.is_deleted IS 'Soft delete flag - true if record is deleted';
COMMENT ON COLUMN activities.deleted_at IS 'Timestamp when record was soft deleted';

-- Verify the migration
SELECT 'Migration completed successfully!' AS status;
