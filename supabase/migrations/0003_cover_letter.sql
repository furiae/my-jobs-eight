-- Add cover_letter_text column to store the AI-generated letter used per application
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS cover_letter_text TEXT;
