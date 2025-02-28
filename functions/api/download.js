import ytdl from 'ytdl-core';

// ytdl-core 원본 링크: https://github.com/fent/node-ytdl-core

export async function onRequest(context) {
  const { request } = context;

  // GET 파라미터 추출
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  const format = searchParams.get('format'); // 'mp4' or 'mp3'
  const quality = searchParams.get('quality'); // ex) '1080p', '720p' ... or '320', '256', ...

  // 기본적인 유효성 검사
  if (!videoUrl) {
    return new Response('Missing "url" parameter', { status: 400 });
  }
  if (!ytdl.validateURL(videoUrl)) {
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
    // mp4(비디오+오디오) 형식 필터링
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio')
      .filter(f => f.container === 'mp4' && f.qualityLabel);

    // 요청 화질과 일치하는 형식 찾기
    selectedFormat = formats.find(f => f.qualityLabel === quality);
    // 없다면 첫 번째 형식을 기본 선택
    if (!selectedFormat) {
      selectedFormat = formats[0];
    }

  } else if (format === 'mp3') {
    // mp3 용(오디오만). 실제로는 오디오 스트림을 그대로 전달
    const formats = ytdl.filterFormats(info.formats, 'audioonly');
    const desiredBitrate = parseInt(quality, 10);
    // 원하는 비트레이트에 가장 가까운 오디오 스트림 선택
    selectedFormat = formats.reduce((prev, curr) => {
      return (Math.abs(curr.audioBitrate - desiredBitrate) < Math.abs(prev.audioBitrate - desiredBitrate)) ? curr : prev;
    }, formats[0]);

  } else {
    return new Response('Invalid format parameter', { status: 400 });
  }

  if (!selectedFormat) {
    return new Response('No matching format found', { status: 404 });
  }

  // 파일명: 동영상 제목을 가져와서 특수문자를 _로 치환
  const title = info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${title}.${format}`;

  // Content-Disposition 헤더 설정
  const headers = new Headers();
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  // ytdl-core를 사용해 스트림 생성
  const stream = ytdl.downloadFromInfo(info, { format: selectedFormat });

  // Cloudflare Pages에서 스트림 Response를 그대로 반환
  return new Response(stream, { headers });
}
