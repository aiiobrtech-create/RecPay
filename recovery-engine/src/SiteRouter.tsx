import { useEffect, useMemo, useState } from "react";
import App from "./App";
import { LegalPage } from "./LegalPage";

type Route = "landing" | "termos-de-uso" | "privacidade";

function resolveRoute(): Route {
  const hash = window.location.hash
    .replace(/^#/, "")
    .split("#")[0]
    .replace(/^\//, "")
    .trim()
    .toLowerCase();
  const pathname = window.location.pathname.replace(/^\/+|\/+$/g, "").trim().toLowerCase();
  const candidate = hash || pathname;

  if (candidate === "termos-de-uso") return "termos-de-uso";
  if (candidate === "privacidade" || candidate === "politica-de-privacidade") return "privacidade";
  return "landing";
}

export function SiteRouter() {
  const [route, setRoute] = useState<Route>(() => resolveRoute());

  useEffect(() => {
    const onRouteChange = () => setRoute(resolveRoute());
    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, []);

  const page = useMemo(() => {
    if (route === "termos-de-uso") return <LegalPage slug="termos-de-uso" />;
    if (route === "privacidade") return <LegalPage slug="privacidade" />;
    return <App />;
  }, [route]);

  return page;
}
