import { useEffect, useRef, useState, type DragEvent } from "react";

export function useChatImage(setError: (error: string | null) => void, allowWebp = true) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const accept = allowWebp ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png";

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function clear() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    if (fileInput.current) fileInput.current.value = "";
    setFile(null);
    setPreview(null);
  }

  function select(image: File | null) {
    if (!image) return;
    setError(null);
    if (!accept.split(",").includes(image.type.toLowerCase())) {
      setError(allowWebp ? "Envie uma imagem JPG, PNG ou WEBP." : "Envie uma imagem JPG ou PNG.");
    } else if (!image.size || image.size > 5 * 1024 * 1024) {
      setError(image.size ? "A imagem deve ter no máximo 5 MB." : "A imagem selecionada está vazia.");
    } else {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(image);
      setFile(image);
      setPreview(objectUrl.current);
      return;
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function dropHandlers(disabled: boolean) {
    return {
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        if (disabled) return;
        if (event.dataTransfer.files.length > 1) {
          setError("Anexe uma imagem por mensagem.");
          return;
        }
        select(event.dataTransfer.files[0] ?? null);
      },
    };
  }

  return { file, preview, fileInput, accept, select, clear, dropHandlers };
}
