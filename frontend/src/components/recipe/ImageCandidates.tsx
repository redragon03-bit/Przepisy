import { api, Recipe } from "../../api";
import { useToast } from "../../lib/toast";

// Zdjęcia z internetu do wyboru - stuknięcie ustawia zdjęcie przepisu
export default function ImageCandidates({ recipe, urls, onPicked, onClose }: {
  recipe: Recipe;
  urls: string[];
  onPicked: (r: Recipe) => void;
  onClose: () => void;
}) {
  const { run } = useToast();
  const pick = async (url: string) => {
    const saved = await run(() => api.setImageFromUrl(recipe.id, url));
    if (saved) onPicked(saved);
  };
  return (
    <section className="box">
      <p className="small muted">Stuknij zdjęcie, które pasuje:</p>
      <div className="candidates">
        {urls.map((url) => (
          <button key={url} type="button" onClick={() => pick(url)}>
            <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      <button type="button" className="link small" onClick={onClose}>
        Żadne nie pasuje
      </button>
    </section>
  );
}
