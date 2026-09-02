import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { useProjectStore } from "../../../state/projectStore";
import { FolderIcon, SparklesIcon } from "../../common/Icons";

/** The fork the ＋ used to skip: build something, or adopt something. */
export function StartChoiceStep() {
  const go = useProjectCreateStore((state) => state.go);
  const close = useProjectCreateStore((state) => state.close);
  const pickAndCreate = useProjectStore((state) => state.pickAndCreate);

  const openExisting = () => {
    close();
    void pickAndCreate();
  };

  return (
    <div className="np-start">
      <button className="np-choice" data-autofocus type="button" onClick={() => go("kind")}>
        <span className="np-choice__mark np-choice__mark--new"><SparklesIcon size={19} /></span>
        <strong>Start something new</strong>
        <small>Pick what you are making and Vibyra sets the project up for you.</small>
      </button>
      <button className="np-choice" type="button" onClick={openExisting}>
        <span className="np-choice__mark"><FolderIcon size={19} /></span>
        <strong>Open a folder I have</strong>
        <small>Point at code that already exists. Nothing in it is changed.</small>
      </button>
    </div>
  );
}
