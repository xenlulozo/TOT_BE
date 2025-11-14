  import { Assets ,Application ,Sprite} from "pixi.js";
import { Client } from "colyseus.js";

async function resolveEndpoint(): Promise<string> {
  const rawEnv =  await ( "ws://localhost:2567").trim();

  if (rawEnv.length > 0) {
    try {
      return new URL(rawEnv).toString();
    } catch (error) {
      console.warn(
        "[client] VITE_COLYSEUS_ENDPOINT is invalid, falling back to window.location",
        error,
      );
    }
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const secure = protocol === "https:";
    const wsProtocol = secure ? "wss" : "ws";
    const inferredPort =
      port && port !== "80" && port !== "443" ? port : "2567";
    return `${wsProtocol}://${hostname}:${inferredPort}`;
  }

  // SSR / tests
  return "ws://127.0.0.1:2567";
}

async function showConnectionStatus() {
  const endpoint =await resolveEndpoint();
  const statusEl = document.getElementById("connection-status");

  if (!statusEl) {
    console.warn("[client] #connection-status element not found");
  } else {
    statusEl.textContent = `Connecting to ${endpoint}...`;
  }

  try {
    const client = new Client(  endpoint);
    const room = await client.joinOrCreate("my_room");
    statusEl &&
      (statusEl.textContent = `Connected to ${room.sessionId} @ ${endpoint}`);
    console.info(`[client] Connected to ${room.sessionId} @ ${endpoint}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : JSON.stringify(err ?? {});
    statusEl &&
      (statusEl.textContent = `Failed to connect to ${endpoint}: ${message}`);
    console.error(`[client] Failed to connect ${endpoint}:`, err);
  }
}

showConnectionStatus();
(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({ background: "#1099bb", resizeTo: window });

  // Append the application canvas to the document body
  document.getElementById("pixi-container")!.appendChild(app.canvas);

  // Load the bunny texture
  const texture = await Assets.load("/assets/bunny.png");

  // Create a bunny Sprite
  const bunny = new Sprite(texture);

  // Center the sprite's anchor point
  bunny.anchor.set(0.5);

  // Move the sprite to the center of the screen
  bunny.position.set(app.screen.width / 2, app.screen.height / 2);

  // Add the bunny to the stage
  app.stage.addChild(bunny);

  // Listen for animate update
  app.ticker.add((time) => {
    // Just for fun, let's rotate mr rabbit a little.
    // * Delta is 1 if running at 100% performance *
    // * Creates frame-independent transformation *
    bunny.rotation += 0.1 * time.deltaTime;
  });
})();
