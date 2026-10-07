import { Globe2 } from "lucide-react";
import { useState } from "react";

function SiteIcon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (!/^https?:/.test(url) || failed)
    return <Globe2 className="size-4 text-muted-foreground" />;
  return (
    <img
      className="size-4 rounded-sm"
      src={`${new URL(url).origin}/favicon.ico`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

export default SiteIcon;
