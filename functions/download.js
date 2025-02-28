import ytdl from 'ytdl-core';

export async function onRequest(context) {
  const { request } = context;
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  const format = searchParams.get('format'); // 'mp4' 또는 'mp3'
  const quality = searchParams.get('quality'); // mp4: "1080p", "720p", ... / mp3: "320", "256", ...

  // URL 유효성 검사
  if (!videoUrl || !ytdl.validateURL(videoUrl)) {
    return new Response('Invalid YouTube URL', { status: 400 });
  }

  let info;
  try {
    info = await ytdl.getInfo(videoUrl);
  } catch (err) {
    return new Response('Failed to retrieve video info', { status: 500 });
  }

  let selectedFormat;
  if (format === 'mp4') {
    // mp4의 경우, 비디오와 오디오가 결합된 mp4 컨테이너의 형식을 필터링
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio')
      .filter(f => f.container === 'mp4' && f.qualityLabel);
    // 요청한 화질(예: "720p")과 정확히 일치하는 형식을 우선 선택
    selectedFormat = formats.find(f => f.qualityLabel === quality);
    if (!selectedFormat) {
      // 요청 화질과 일치하는 형식이 없으면 첫번째 형식을 기본 선택
      selectedFormat = formats[0];
    }
  } else if (format === 'mp3') {
    // mp3의 경우, 오디오 전용 형식을 필터링 (실제 변환 기능은 Workers의 제약으로 생략되고, 원본 오디오 스트림을 전달)
    const formats = ytdl.filterFormats(info.formats, 'audioonly');
    const desiredBitrate = parseInt(quality, 10);
    selectedFormat = formats.reduce((prev, curr) => {
      return (Math.abs(curr.audioBitrate - desiredBitrate) < Math.abs(prev.audioBitrate - desiredBitrate) ? curr : prev);
    }, formats[0]);
  } else {
    return new Response('Invalid format parameter', { status: 400 });
  }

  if (!selectedFormat) {
    return new Response('No matching format found', { status: 404 });
  }

  // 파일명 설정 (제목의 특수문자는 _로 대체)
  const title = info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${title}.${format}`;

  const headers = new Headers();
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  // ytdl-core의 downloadFromInfo를 통해 스트림 생성 (원본 스트림 그대로 제공)
  const stream = ytdl.downloadFromInfo(info, { format: selectedFormat });
  return new Response(stream, {
    headers: headers,
  });
}
