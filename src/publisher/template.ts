
export const template = (basePath: string, content: string) => `
<html>
	<head>
		<title>Dev Radar</title>
		<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC" crossorigin="anonymous">
		<link rel="stylesheet" href="${basePath}/styles.css" />
	</head>
	<body>
	<header>
<nav class="navbar navbar-expand-lg navbar-light bg-light">
  <div class="container-fluid">
    <a class="navbar-brand" href="#">Dev Radar</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarSupportedContent">
      <ul class="navbar-nav me-auto mb-2 mb-lg-0">
        <li class="nav-item">
          <a class="nav-link active" aria-current="page" href="${basePath}/">Home</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" aria-current="page" href="${basePath}/categories.html">Categories</a>
        </li>
      </ul>
    </div>
  </div>
</nav>
	</header>
	<main>
		${content}
	</main>
	</body>
</html>`;
