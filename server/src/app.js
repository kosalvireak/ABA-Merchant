import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import productsRoutes from "./routes/products.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";

/**
 * Builds the Express app. Kept separate from index.js so tests can
 * import the app without starting a listener.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin }));
  app.use(morgan("dev"));
  app.use(express.json());

  // Light rate limit on the money-related route: 30 requests per minute per IP.
  const paymentsLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "RATE_LIMITED", message: "Too many requests, try again in a minute." },
    },
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/products", productsRoutes);
  app.use("/api/payments", paymentsLimiter, paymentsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
