
import { LoginButton } from "./LoginButton";

export const ErrorComponent = ({ message }: { message: string }) => (<div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
    <h1 className="text-2xl font-bold">認証が失敗しました</h1>
    <p>{message}</p>
    <LoginButton />
</div>)