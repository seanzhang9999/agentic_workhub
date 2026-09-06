for(const button of document.querySelectorAll('[data-prompt]'))button.addEventListener('click',async()=>{
  const field=document.querySelector('#prompt-'+button.dataset.prompt),status=document.querySelector('#guide-status');
  try{await navigator.clipboard.writeText(field.value);status.textContent='已复制，尚未向任何 Agent 发送。';}
  catch{field.select();status.textContent='请手动复制选中的提示词。';}
});
