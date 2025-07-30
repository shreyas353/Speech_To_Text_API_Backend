require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const { createClient } = require("@deepgram/sdk");
const supabase = require("./supabaseClient"); // ✅ Import Supabase client

const app = express();
const PORT = process.env.PORT || 5000;
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Multer config
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Root route
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// Transcribe audio route
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded." });
    }

    // Log file info for debugging (especially for mobile)
    console.log("📥 File received:", {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    const audioBuffer = req.file.buffer;

    // Check for empty buffer (common on mobile issues)
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "Audio buffer is empty." });
    }

    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        mimetype: req.file.mimetype || "audio/webm", // fallback for mobile browsers
        model: "general",
        smart_format: true,
      }
    );

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Transcript is empty." });
    }

    // ✅ Manually editable file URL (you can change this later)
    const fileUrl = "NotStored"; // optional manual update

    // Save to Supabase
    const { data, error } = await supabase
      .from("transcriptions")
      .insert([
        {
          file_url: fileUrl,
          transcription: transcript,
        },
      ])
      .select(); // ensure response includes inserted data

    console.log("📦 Supabase response:", { data, error });

    if (error) {
      console.error("❌ Supabase insert error:", error.message || error);
      return res.status(500).json({ error: "Failed to save transcription" });
    }

    res.json({ transcript });
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🟢 Server running on http://localhost:${PORT}`);
});