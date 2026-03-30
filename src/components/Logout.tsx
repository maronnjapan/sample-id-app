import { signOut } from "@/auth";

export function Logout() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut();
      }}
    >
      <button
        type="submit"
        className="bg-gray-500 hover:bg-gray-600 text-white py-1 px-4 rounded-md text-sm"
      >
        ログアウト
      </button>
    </form>
  );
}
