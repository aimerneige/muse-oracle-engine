import GenerationStep from "../components/GenerationStep.jsx";
import StoryboardView from "../components/StoryboardView.jsx";
import { useProject } from "../store/ProjectStore.jsx";
import { selectedEpisodes } from "../store/selectors.js";
export default function StoryboardStep(props) {
  const { project } = useProject();
  return (
    <>
      {project.storyMode === "four" ? (
        selectedEpisodes(project).map((e) => (
          <GenerationStep
            key={e.episode}
            {...props}
            stage="storyboard"
            episode={e.episode}
          />
        ))
      ) : (
        <GenerationStep {...props} stage="storyboard" />
      )}
      <StoryboardView />
    </>
  );
}
