import type {ReactNode} from 'react';
import './operator-contact.css';
function inlineMarkdown(line:string):ReactNode[]{
 return line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part,i)=>{
  if(part.startsWith('**')&&part.endsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
  if(part.startsWith('*')&&part.endsWith('*'))return <em key={i}>{part.slice(1,-1)}</em>;
  if(part.startsWith('`')&&part.endsWith('`'))return <code key={i}>{part.slice(1,-1)}</code>;
  return part;
 });
}
export default function MarkdownMessage({value}:{value:string}){
 const lines=value.split(/\r?\n/);
 return <div className="ascend-markdown">{lines.map((line,i)=>{
  if(line.startsWith('### '))return <h5 key={i}>{inlineMarkdown(line.slice(4))}</h5>;
  if(line.startsWith('## '))return <h4 key={i}>{inlineMarkdown(line.slice(3))}</h4>;
  if(line.startsWith('# '))return <h3 key={i}>{inlineMarkdown(line.slice(2))}</h3>;
  if(/^[-*] /.test(line))return <div className="ascend-markdown-list" key={i}><span>•</span><div>{inlineMarkdown(line.slice(2))}</div></div>;
  if(/^\d+\. /.test(line))return <div className="ascend-markdown-list" key={i}><span>{line.match(/^\d+/)?.[0]}.</span><div>{inlineMarkdown(line.replace(/^\d+\. /,''))}</div></div>;
  return <p key={i}>{line?inlineMarkdown(line):'\u00a0'}</p>;
 })}</div>;
}