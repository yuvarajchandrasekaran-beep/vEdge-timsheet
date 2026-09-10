import "dotenv/config";
import { createApp } from "./app";
import { startScheduler } from "./jobs/scheduler";

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`TimeSync API listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  startScheduler();
});
