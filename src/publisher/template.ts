
export const template = (basePath: string, content: string) => `
<html>
	<head>
		<title>Dev Radar</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC" crossorigin="anonymous">
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js" integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM" crossorigin="anonymous"></script>
		<link rel="stylesheet" href="${basePath}/styles.css" />
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2361701055964881" crossorigin="anonymous"></script>
        <link rel="icon" type="image/png" sizes="32x32" href="${basePath}/favicon-32x32.png">
	</head>
	<body>
	<header>
      <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container-fluid">
          <a class="navbar-brand" href="${basePath}/">
          <img src="${basePath}/logo.png" width="30" height="30" class="d-inline-block align-top" alt="logo"> Dev Radar</a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0">
              <li class="nav-item">
                <a class="nav-link active" aria-current="page" href="${basePath}/">Home</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" aria-current="page" href="${basePath}/categories.html">Topics</a>
              </li>
            </ul>
          </div>
        </div>
      </nav>
	</header>
	<main class="container">
		${content}
	</main>
    <footer class="footer mt-auto py-3 bg-dark">
      <div class="container">
        <span class="text-muted">2023 | dev-radar</span>
      </div>
    </footer>
	</body>
</html>`;
