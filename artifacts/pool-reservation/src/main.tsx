import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Set up the API client token getter
setAuthTokenGetter(() => localStorage.getItem("pool_token"));
setBaseUrl(import.meta.env.BASE_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);