import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TimeSync API",
      version: "1.0.0",
      description:
        "Enterprise Timesheet, Approval & Reporting Platform — Vivid Edge Integration COE. " +
        "See SCHEMA_REFERENCE.md in the repo root for the full data model.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./dist/routes/*.js"],
});
