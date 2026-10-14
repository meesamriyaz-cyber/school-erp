
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import env from "./config/env.js";
import routes from "./routes/index.js";
import NotFound from "./middleware/NotFound.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

const allowedOrigins = new Set([env.webUrl]);

if (env.nodeEnv !== "production") {
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://localhost:8081");
}

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origin not allowed by CORS");
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(morgan("dev"));

app.use("/api/v1", routes);

app.use(NotFound);
app.use(errorHandler);

export default app;
