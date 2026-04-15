'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';

import { loadPlacesLibrary } from '@/lib/google-maps';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddressAutocompleteInputProps {
  apiKey: string;
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  helpText?: string;
}

interface AddressSuggestion {
  id: string;
  label: string;
  prediction: any;
}

const MIN_QUERY_LENGTH = 3;

export function AddressAutocompleteInput({
  apiKey,
  id,
  label,
  placeholder,
  value,
  onChange,
  helpText,
}: AddressAutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const placesLibraryRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);

  const resolvedApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!resolvedApiKey || !isFocused || value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        if (!placesLibraryRef.current) {
          placesLibraryRef.current = await loadPlacesLibrary(resolvedApiKey);
        }

        if (!sessionTokenRef.current && placesLibraryRef.current.AutocompleteSessionToken) {
          sessionTokenRef.current = new placesLibraryRef.current.AutocompleteSessionToken();
        }

        const request: Record<string, unknown> = {
          input: value.trim(),
          language: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        };

        if (sessionTokenRef.current) {
          request.sessionToken = sessionTokenRef.current;
        }

        const response = await placesLibraryRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

        if (cancelled || currentRequestId !== requestIdRef.current) {
          return;
        }

        const nextSuggestions = (response?.suggestions ?? [])
          .map((entry: any, index: number) => {
            const prediction = entry?.placePrediction;
            const labelText = prediction?.text?.toString?.();

            if (!prediction || !labelText) {
              return null;
            }

            return {
              id: prediction.placeId ?? `${labelText}-${index}`,
              label: labelText,
              prediction,
            } satisfies AddressSuggestion;
          })
          .filter((entry: AddressSuggestion | null): entry is AddressSuggestion => Boolean(entry))
          .slice(0, 5);

        setAutocompleteError(null);
        setSuggestions(nextSuggestions);
      } catch (error) {
        if (!cancelled) {
          setSuggestions([]);
          setAutocompleteError(error instanceof Error ? error.message : 'Address autocomplete failed.');
        }
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isFocused, resolvedApiKey, value]);

  const refreshSessionToken = () => {
    if (placesLibraryRef.current?.AutocompleteSessionToken) {
      sessionTokenRef.current = new placesLibraryRef.current.AutocompleteSessionToken();
    }
  };

  const handleSuggestionSelect = async (suggestion: AddressSuggestion) => {
    setIsResolving(true);

    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({
        fields: ['formattedAddress'],
      });

      onChange(place.formattedAddress || suggestion.label);
      setSuggestions([]);
      setAutocompleteError(null);
      setIsFocused(false);
      refreshSessionToken();
    } catch (error) {
      onChange(suggestion.label);
      setAutocompleteError(error instanceof Error ? error.message : 'Could not resolve the selected address.');
    } finally {
      setIsResolving(false);
    }
  };

  const showSuggestions = isFocused && suggestions.length > 0;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-slate-500" /> {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setAutocompleteError(null);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            blurTimeoutRef.current = window.setTimeout(() => {
              setIsFocused(false);
            }, 120);
          }}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={`${id}-suggestions`}
        />
        {(isLoading || isResolving) && (
          <div className="absolute inset-y-0 right-3 flex items-center">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}
        {showSuggestions && (
          <div id={`${id}-suggestions`} className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-700 last:border-b-0 hover:bg-slate-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSuggestionSelect(suggestion)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {helpText && <p className="text-xs text-slate-500">{helpText}</p>}
      {!resolvedApiKey && (
        <p className="text-xs text-amber-700">Set a Google Maps API key to enable live address suggestions for this field.</p>
      )}
      {autocompleteError && (
        <p className="text-xs text-amber-700">{autocompleteError}</p>
      )}
    </div>
  );
}
