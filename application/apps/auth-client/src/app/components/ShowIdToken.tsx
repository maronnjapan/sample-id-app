'use client';

interface ShowIdTokenProps {
    idToken: string;
}

export const ShowIdToken: React.FC<ShowIdTokenProps> = ({ idToken }) => {
    const copyToClipboard = () => {
        navigator.clipboard.writeText(idToken).then(() => {
            alert('IDトークンがクリップボードにコピーされました');
        }).catch((err) => {
            console.error('クリップボードへのコピーに失敗しました:', err);
        });
    };

    return (
        <div>
            <h3>IDトークン：</h3>
            <p>{idToken.split('.').join('.\n')}</p>
            <button className="styled-button" onClick={copyToClipboard}>クリップボードにコピー</button>
        </div>
    );
};