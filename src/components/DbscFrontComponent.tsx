'use client'
import { sortUlid } from "@/util";
import Image from "next/image";
import { Fragment, useEffect, useState } from "react";

export function DbscFrontComponent() {
    const [cookie, setCookie] = useState<{ id: string, value: string }[]>([])
    const [isCookieExpired, setIsCookieExpired] = useState(false)

    const fetchData = async () => {
        const res = await fetch('/api/dummy')
    }
    const convertCookieToStringList = (cookie: string) => {
        const cookieList = cookie.split('; ')

        const pattern = /^[0-9A-Z]{26}/
        return cookieList.filter(val => pattern.test(val)).map((item) => {
            return item.split('=')
        }).sort((a, b) => b[0].localeCompare(a[0])).map(val => {
            return [val[0], decodeURIComponent(val[1])]
        })
    }

    useEffect(() => {
        fetch('/api/start-dbsc-flow')
        const timer = setInterval(() => {
            setCookie((prev) => {
                const cookieString = document.cookie
                const cookies = convertCookieToStringList(cookieString)
                const addCookies = cookies.filter((item) => {
                    return !prev.some((prevItem) => prevItem.id === item[0])
                }).map((item) => {
                    return {
                        id: item[0],
                        value: item[1]
                    }
                })
                if (!cookieString.includes('auth_cookie') && prev[0] && !prev[0].value.endsWith('Cookie Expired')) {
                    return [{ id: sortUlid(), value: 'Cookie Expired' }, ...addCookies, ...prev,]
                }
                return [...addCookies, ...prev]
            })
        }, 500)
        return () => clearInterval(timer)
    }, [])


    return (
        <div className=" items-center justify-items-center min-h-screen p-8 pb-20 gap-16 font-[family-name:var(--font-geist-sans)]">
            <main className="flex flex-col gap-2 row-start-2 sm:items-start flex-wrap w-full">
                <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={fetchData}>Fetch Data</button>
                {
                    cookie.map((item, index) => {
                        return (
                            <Fragment key={item.id}>
                                <div className="w-full flex gap-2 justify-stretch">
                                    <div>
                                        {item.value.split('\n\r').map((val, index) => {
                                            return (
                                                <p key={index} className={`
                                                w-[800] ${index === 0 ? 'whitespace-pre-wrap' : 'whitespace-nowrap'} truncate
                                                `}>{val}</p>
                                            )
                                        }
                                        )}
                                    </div>
                                    <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={async () => {
                                        await navigator.clipboard.writeText(item.value)
                                        alert('copied to clipboard')
                                    }}>Copy</button>
                                </div>
                                <hr className="w-full h-0.5 border-gray-300" />
                            </Fragment>
                        )
                    }
                    )
                }

            </main>
        </div>
    );
}
