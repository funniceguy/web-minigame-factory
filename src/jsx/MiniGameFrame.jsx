(() => {
    const params = window.__MGP_RUNNER_PARAMS__ || {};
    const gameId = params.gameId || 'unknown-game';
    const htmlPath = params.html || '';

    function App() {
        const frameRef = React.useRef(null);

        React.useEffect(() => {
            window.parent.postMessage({
                source: 'mgp-game',
                type: 'runner-ready',
                payload: {
                    gameId,
                    renderer: 'jsx'
                }
            }, '*');

            const relayMessage = (event) => {
                if (!frameRef.current) return;
                if (event.source !== frameRef.current.contentWindow) return;
                window.parent.postMessage(event.data, '*');
            };

            window.addEventListener('message', relayMessage);
            return () => window.removeEventListener('message', relayMessage);
        }, []);

        if (!htmlPath) {
            return (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#111',
                        color: '#fff',
                        fontFamily: 'sans-serif',
                        padding: '16px',
                        boxSizing: 'border-box'
                    }}
                >
                    Missing `html` query parameter.
                </div>
            );
        }

        return (
            <iframe
                ref={frameRef}
                src={htmlPath}
                title={`${gameId}-html-host`}
                style={{ width: '100%', height: '100%', border: 'none', background: '#000' }}
                allow="autoplay; fullscreen"
                allowFullScreen
            />
        );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
