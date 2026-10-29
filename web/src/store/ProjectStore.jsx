import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import {
  defaultSettings,
  hydrateProject,
  newProject,
  readJSON,
  writeJSON,
  keys,
  persistableProject,
} from "../engine/storage.js";
import { loadCharacterSettings } from "../engine/characters.js";
import { recoveredStep } from "./selectors.js";

const Context = createContext(null);
export function ProjectProvider({ children }) {
  const [state, render] = useReducer(
    (s, patch) => ({ ...s, ...patch }),
    null,
    () => {
      const saved = readJSON(keys.project, null);
      const project = saved ? hydrateProject(saved) : newProject();
      return {
        project,
        settings: { ...defaultSettings(), ...readJSON(keys.settings, {}) },
        characterSettings: loadCharacterSettings(readJSON(keys.characters, [])),
        ui: { step: recoveredStep(project) },
        job: null,
        saved: false,
        saveError: "",
        logs: [],
      };
    },
  );
  const latest = useRef(state);
  const update = (patch) => {
    latest.current = { ...latest.current, ...patch };
    render(patch);
  };
  const save = () => {
    try {
      writeJSON(keys.project, persistableProject(latest.current.project));
      update({ saved: true, saveError: "" });
    } catch (error) {
      update({ saved: false, saveError: error.message });
    }
  };
  useEffect(() => {
    update({ saved: false });
    const timer = setTimeout(save, 350);
    return () => clearTimeout(timer);
  }, [state.project]);
  useEffect(() => {
    const flush = () => save();
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);
  const patchProject = (patch) =>
    update({
      project: {
        ...latest.current.project,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    });
  const snapshot = () => {
    const project = persistableProject(latest.current.project);
    writeJSON(
      keys.history,
      [
        project,
        ...readJSON(keys.history, []).filter((p) => p.id !== project.id),
      ].slice(0, 20),
    );
  };
  return (
    <Context.Provider
      value={{
        ...state,
        get: () => latest.current,
        update,
        patchProject,
        snapshot,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useProject = () => useContext(Context);
