import GenerationStep from "../components/GenerationStep.jsx";
import OutlineView from "../components/OutlineView.jsx";
export default function OutlineStep(props) {
  return (
    <>
      <GenerationStep {...props} stage="outline" />
      <OutlineView />
    </>
  );
}
