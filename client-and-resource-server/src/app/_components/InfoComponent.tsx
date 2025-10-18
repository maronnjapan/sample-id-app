'use client'
import { useState } from "react"
import { fetchSampleApi } from "../actions"

export const InfoComponent = ({ message }: { message: string }) => {
    const [showMessage, setShowMessage] = useState(message)
    const [loading, setLoading] = useState(false)
    const resendRequest = async () => {
        setLoading(true)
        const res = await fetchSampleApi()
        setShowMessage(JSON.stringify(res, null, 2));
        setLoading(false)
    }

    return (
        <div className="gap-2 flex flex-col items-center">
            {loading ? <div className="flex justify-center">
                <div
                    className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"
                ></div>
            </div> : <pre className="p-4 rounded max-w-lg whitespace-pre-wrap break-all">{showMessage}</pre>}
            <button onClick={resendRequest} className={`mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={loading}>
                再リクエスト
            </button>
        </div>
    )
}