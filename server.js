const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const User = require("./models/User");

function normalizeRegistration(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Please provide valid registration details" };
  }

  const { name, email, phone, password } = body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof phone !== "string" ||
    typeof password !== "string"
  ) {
    return { error: "Please fill in all fields" };
  }

  const normalized = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    password,
  };
  const phoneDigits = normalized.phone.replace(/\D/g, "");

  if (!normalized.name || !normalized.email || !normalized.phone || !password) {
    return { error: "Please fill in all fields" };
  }
  if (normalized.name.length > 100) {
    return { error: "Name must be 100 characters or fewer" };
  }
  if (
    normalized.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)
  ) {
    return { error: "Please provide a valid email address" };
  }
  if (
    !/^\+?[\d\s().-]+$/.test(normalized.phone) ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    return { error: "Please provide a valid phone number" };
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return { error: "Password must be at least 8 characters and no more than 72 bytes" };
  }

  return { value: normalized };
}

function createApp({ UserModel = User } = {}) {
  const app = express();
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || allowedOrigins.includes(origin)),
    })
  );
  app.use(express.json({ limit: "10kb" }));

  app.get("/", (req, res) => {
    res.send("Backend Connected Successfully");
  });

  app.get("/api/health", (req, res) => {
    const isDatabaseReady = mongoose.connection.readyState === 1;
    res.status(isDatabaseReady ? 200 : 503).json({
      status: isDatabaseReady ? "ok" : "unavailable",
      database: isDatabaseReady ? "connected" : "disconnected",
    });
  });

  app.post("/api/register", async (req, res) => {
    const registration = normalizeRegistration(req.body);
    if (registration.error) {
      return res.status(400).json({ message: registration.error });
    }

    try {
      const { name, email, phone, password } = registration.value;
      const existingUser = await UserModel.findOne({ email });

      if (existingUser) {
        return res.status(409).json({ message: "Email already registered" });
      }

      const user = await UserModel.create({ name, email, phone, password });
      return res.status(201).json({
        message: "User saved successfully",
        userId: user._id,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "Email already registered" });
      }

      console.error("Registration error:", error.message);
      return res.status(500).json({ message: "Failed to save user" });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error.status === 400 || error.status === 413) {
      return res.status(error.status).json({
        message:
          error.status === 413
            ? "Request body is too large"
            : "Request body must contain valid JSON",
      });
    }

    console.error("Request error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  });

  return app;
}

async function startServer() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI must be set before starting the backend");
  }

  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB Connected Successfully");

  try {
    const app = createApp();
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, () => resolve(listener));
      listener.once("error", reject);
    });
    console.log(`Backend running on port ${port}`);
    return server;
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Backend startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp, normalizeRegistration, startServer };
