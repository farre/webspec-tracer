/** Sidebar panel entry point. M0: a ping button to validate messaging. */
import { send } from "./api.js";

const out = document.getElementById("out") as HTMLPreElement;
const pingBtn = document.getElementById("ping") as HTMLButtonElement;

pingBtn.addEventListener("click", async () => {
  out.textContent = "…";
  try {
    const res = await send({ kind: "ping", payload: "hello" });
    out.textContent = JSON.stringify(res, null, 2);
  } catch (e) {
    out.textContent = `error: ${String(e)}`;
  }
});
