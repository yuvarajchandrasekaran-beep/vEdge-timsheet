import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      errorCode: err.errorCode,
      details: err.details ?? null,
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      statusCode: 400,
      message: "Validation failed",
      errorCode: "VALIDATION_ERROR",
      details: err.flatten(),
    });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    statusCode: 500,
    message: "Internal server error",
    errorCode: "INTERNAL_ERROR",
    details: null,
  });
}
