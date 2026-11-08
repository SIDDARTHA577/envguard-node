import React from 'react';

export default function App() {
  const untrustedSnippet = '<script>window.location="http://attacker.com"</script>';
  const leakedApiKey = 'sk_live_99999999999999999999';

  return (
    <div>
      <div>Application Header (no main or h1)</div>
      <img src="/banner.jpg" />
      <div dangerouslySetInnerHTML={{ __html: untrustedSnippet }} />
      <div onClick={() => console.log('clicked button without button role')}>Click me</div>
      <span>Api Key: {leakedApiKey}</span>
    </div>
  );
}
