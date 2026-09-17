export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">{label}
      <input {...props} className="mt-1 w-full rounded-lg border px-3 py-2" />
    </label>
  );
}
