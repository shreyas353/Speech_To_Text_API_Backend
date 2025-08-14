require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { createClient } = require("@deepgram/sdk");
const supabase = require("./supabaseClient");

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

    console.log("📥 File received:", {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    const audioBuffer = req.file.buffer;

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "Audio buffer is empty." });
    }

    // Force a compatible MIME type for Deepgram
    let mimetype = req.file.mimetype;
    if (!["audio/wav","audio/mpeg","audio/webm","audio/ogg"].includes(mimetype)) {
      mimetype = "audio/webm;codecs=opus";
    }

    // Call Deepgram API
    const { result } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
      model: "general",
      smart_format: true,
      mimetype,
    });

    console.log("Deepgram result:", JSON.stringify(result, null, 2));

    // Safely extract transcript
    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      result?.channels?.[0]?.alternatives?.[0]?.transcript ||
      "";

    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Transcript is empty." });
    }

    // Optional: Save to Supabase
    const { data, error } = await supabase
      .from("transcriptions")
      .insert([{ file_url: "NotStored", transcription: transcript }])
      .select();

    if (error) {
      console.error("❌ Supabase insert error:", error.message || error);
    } else {
      console.log("📦 Supabase saved:", data);
    }

    res.json({ transcript });
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
    res.status(500).json({ error: "⚠️ Could not process audio, please try again." });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🟢 Server running on http://localhost:${PORT}`);
});