import "./index.css";
import { startSession, WA } from "./waBridge";

// ensure session boot
startSession("9148330016");

// Optional: simple poll to re-render your clone (if it’s not Redux/Signals)
setInterval(() => {
  // trigger any lightweight state update your clone uses,
  // or dispatch a custom event your components listen to.
  window.dispatchEvent(new Event("wa:update"));
}, 500);
