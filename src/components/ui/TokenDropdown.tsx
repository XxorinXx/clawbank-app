import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { TokenIcon } from "~/components/TokenIcon";

interface Token {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
}

interface TokenDropdownProps {
  tokens: Token[];
  selectedMint: string;
  selectedSymbol: string;
  onSelect: (mint: string, symbol: string) => void;
  disabled?: boolean;
}

export function TokenDropdown({
  tokens,
  selectedMint,
  selectedSymbol,
  onSelect,
  disabled,
}: TokenDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selected = tokens.find((t) => t.mint === selectedMint);

  return (
    <div className="relative w-36" ref={ref}>
      <label className="mb-2 block text-sm font-medium text-gray-700">Token</label>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition-colors hover:border-gray-300 focus:border-gray-400"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {selected ? (
          <>
            <TokenIcon icon={selected.icon} className="h-5 w-5" />
            <span className="flex-1 text-left font-medium">{selected.symbol}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-gray-500">{selectedSymbol || "SOL"}</span>
        )}
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {tokens.length > 0 ? (
            tokens.map((token) => (
              <button
                key={token.mint}
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50"
                onClick={() => {
                  onSelect(token.mint, token.symbol);
                  setIsOpen(false);
                }}
              >
                <TokenIcon icon={token.icon} className="h-5 w-5" />
                <span className="font-medium">{token.symbol}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">No tokens found</div>
          )}
        </div>
      )}
    </div>
  );
}
